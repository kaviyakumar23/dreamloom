"""DreamLoom — FastAPI backend with WebSocket streaming via Google ADK.

Provides real-time voice conversation and multimedia story generation.
Two-model architecture:
  - Conversation model (Live API) for voice interaction
  - Scene model (Gemini interleaved) for native text+image output
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import os
import uuid
import wave as wave_mod
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from google.adk.runners import Runner, RunConfig
from google.adk.sessions import InMemorySessionService
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.genai import types

from fastapi.responses import JSONResponse, Response
from google import genai

from backend.agents.director import create_director_agent
from backend.config import config
from backend.services.firestore_persistence import firestore_persistence
from backend.services.media_handler import MediaHandler, LOCAL_MEDIA_DIR, media_handler
from backend.services.music_generator import music_generator
from backend.services.scene_generator import scene_generator
from backend.services.story_state import session_manager, connection_manager, CollaboratorInfo

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set Google API key for genai SDK
if config.google_api_key:
    os.environ["GOOGLE_API_KEY"] = config.google_api_key


async def verify_models() -> None:
    """Verify configured models are accessible on startup."""
    logger.info("Verifying models...")
    logger.info("  CONVERSATION_MODEL = %s", config.conversation_model)
    logger.info("  SCENE_MODEL = %s", config.scene_model)
    logger.info("  MUSIC_MODEL = %s", config.music_model)

    # Verify scene model (the one we call directly)
    ok = await scene_generator.verify_model()
    if not ok:
        logger.warning(
            "Scene model '%s' verification failed. Scene generation may not work. "
            "Check SCENE_MODEL env var. Tested fallbacks: gemini-2.0-flash-exp, gemini-2.5-flash",
            config.scene_model,
        )
    else:
        logger.info("Scene model OK: %s", config.scene_model)

    # Verify music model (Lyria RealTime)
    music_ok = await music_generator.verify()
    if not music_ok:
        logger.warning(
            "Music model '%s' verification failed. Will fall back to static audio loops.",
            config.music_model,
        )
    else:
        logger.info("Music model OK: %s", config.music_model)

    # Conversation model is verified implicitly when ADK connects
    logger.info("Conversation model will be verified on first connection: %s", config.conversation_model)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — initialize and cleanup resources."""
    logger.info("DreamLoom starting up...")

    # Verify models
    await verify_models()

    yield
    logger.info("DreamLoom shutting down.")


app = FastAPI(
    title="DreamLoom",
    description="Voice-directed immersive story studio",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve local media assets
LOCAL_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(LOCAL_MEDIA_DIR)), name="media")

# ADK session service (in-memory)
session_service = InMemorySessionService()

# Director agent
director_agent = create_director_agent()

# ADK Runner
runner = Runner(
    agent=director_agent,
    app_name="dreamloom",
    session_service=session_service,
)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "app": "dreamloom",
        "version": "2.0.0",
        "conversation_model": config.conversation_model,
        "scene_model": config.scene_model,
        "music_model": config.music_model,
    }


@app.post("/api/tts")
async def text_to_speech(request: Request):
    """Generate narration audio using Gemini TTS.

    Returns a WAV file (24 kHz, 16-bit mono).
    Uses system instruction for natural, expressive storytelling voice.
    """
    body = await request.json()
    text = body.get("text", "")
    voice = body.get("voice", "Kore")

    if not text or not text.strip():
        logger.warning("TTS: empty text received")
        return JSONResponse({"error": "No text provided"}, status_code=400)

    logger.info("TTS: generating for %d chars, voice=%s, text=%s...", len(text), voice, text[:80])

    try:
        import time as _time
        t0 = _time.monotonic()
        client = genai.Client(api_key=config.google_api_key)

        # Gemini TTS uses prompt-based style control (no system_instruction).
        # Structure: director's notes + transcript for natural, expressive narration.
        tts_prompt = (
            "[Audio Profile: A warm, engaging storyteller — "
            "like an audiobook narrator or animated film narrator.]\n"
            "[Scene: Cinematic narration for an illustrated story.]\n"
            "[Director's Notes: Read at a steady, natural pace with warmth and emotion. "
            "Keep it flowing — no long pauses. This is a short voiceover, not a dramatic monologue.]\n\n"
            f"{text}"
        )

        logger.info("TTS: calling Gemini TTS API...")
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash-preview-tts",
            contents=tts_prompt,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=voice,
                        )
                    )
                ),
            ),
        )
        api_elapsed = _time.monotonic() - t0

        pcm_data = response.candidates[0].content.parts[0].inline_data.data
        pcm_duration = len(pcm_data) / (24000 * 2)  # 24kHz 16-bit mono
        logger.info("TTS: API returned %d bytes of PCM (%.1fs audio) in %.1fs", len(pcm_data), pcm_duration, api_elapsed)

        # Wrap raw PCM in WAV headers so browsers can decode it
        buf = io.BytesIO()
        with wave_mod.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)   # 16-bit
            wf.setframerate(24000)
            wf.writeframes(pcm_data)

        wav_size = buf.tell()
        logger.info("TTS: returning WAV %d bytes (%.1fs audio)", wav_size, pcm_duration)

        return Response(
            content=buf.getvalue(),
            media_type="audio/wav",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    except Exception as e:
        logger.error("TTS: generation FAILED: %s", e, exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/gallery/publish")
async def publish_story(request: Request):
    """Publish a story snapshot to the public gallery."""
    body = await request.json()
    required = ["user_id", "session_id"]
    for field in required:
        if not body.get(field):
            return JSONResponse({"error": f"Missing {field}"}, status_code=400)
    # Title fallback: use logline or "Untitled Story"
    if not body.get("title"):
        logline = body.get("logline", "")
        body["title"] = logline[:80] if logline else "Untitled Story"
    data = {
        "session_id": body["session_id"],
        "user_id": body["user_id"],
        "title": body.get("title", ""),
        "genre": body.get("genre", ""),
        "style": body.get("style", ""),
        "logline": body.get("logline", ""),
        "cover_url": body.get("cover_url", ""),
        "trailer_text": body.get("trailer_text", ""),
        "scene_count": body.get("scene_count", 0),
        "scenes": body.get("scenes", []),
        "scene_images": body.get("scene_images", []),
    }
    publish_id = await firestore_persistence.publish_story(data)
    if not publish_id:
        return JSONResponse({"error": "Publish failed"}, status_code=500)
    return JSONResponse({"publish_id": publish_id})


@app.get("/api/gallery")
async def list_gallery(limit: int = 6):
    """List published stories for the public gallery."""
    stories = await firestore_persistence.list_published(limit)
    return JSONResponse({"stories": stories})


@app.get("/api/gallery/mine")
async def my_published(user_id: str = ""):
    """List current user's published stories (for ownership checks)."""
    if not user_id:
        return JSONResponse({"published": []})
    published = await firestore_persistence.get_user_published(user_id)
    return JSONResponse({"published": published})


@app.get("/api/gallery/{publish_id}")
async def get_published_story(publish_id: str):
    """Get full published story for read-only viewer."""
    story = await firestore_persistence.get_published(publish_id)
    if not story:
        return JSONResponse({"error": "Not found"}, status_code=404)
    return JSONResponse({"story": story})


@app.delete("/api/gallery/{publish_id}")
async def unpublish_story(publish_id: str, user_id: str = ""):
    """Unpublish a story (auth by user_id match)."""
    if not user_id:
        return JSONResponse({"error": "user_id required"}, status_code=400)
    ok = await firestore_persistence.unpublish_story(publish_id, user_id)
    if not ok:
        return JSONResponse({"error": "Not found or not authorized"}, status_code=403)
    return JSONResponse({"unpublished": True})


@app.get("/api/sessions")
async def list_sessions(user_id: str = ""):
    """List sessions for a user (summary only)."""
    if not user_id:
        return JSONResponse({"sessions": []})
    sessions = await firestore_persistence.list_user_sessions(user_id)
    return JSONResponse({"sessions": sessions})


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str, user_id: str = ""):
    """Load full session data for restoration."""
    data = await firestore_persistence.load_session(session_id)
    if not data:
        return JSONResponse({"error": "Session not found"}, status_code=404)
    if user_id and data.get("user_id") != user_id:
        return JSONResponse({"error": "Not authorized"}, status_code=403)
    return JSONResponse({"session": data})


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str, user_id: str = ""):
    """Delete a session."""
    if user_id:
        data = await firestore_persistence.load_session(session_id)
        if data and data.get("user_id") != user_id:
            return JSONResponse({"error": "Not authorized"}, status_code=403)
    ok = await firestore_persistence.delete_session(session_id)
    return JSONResponse({"deleted": ok})


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """Main WebSocket endpoint for voice + media streaming.

    Protocol:
    - Client sends JSON messages with type field
    - Client sends binary messages for audio PCM data
    - Server sends JSON messages for text/media/scene events
    - Server sends binary messages for audio PCM playback
    """
    await ws.accept()
    logger.info("WebSocket connected")

    # Read optional query params for user identity and resume
    user_id = ws.query_params.get("user_id", "")
    resume_session_id = ws.query_params.get("resume_session_id", "")
    join_session_id = ws.query_params.get("join_session_id", "")
    display_name = ws.query_params.get("display_name", "")

    # Collaborative join: connect to an existing active session as viewer
    is_viewer = False
    if join_session_id:
        story_session = session_manager.get_session(join_session_id)
        if story_session:
            is_viewer = True
            resumed = True
            logger.info("Viewer joining session %s", join_session_id)
        else:
            # Session not in memory — can't join collaboratively
            await ws.send_json({"type": "error", "message": "Session not found or no longer active."})
            await ws.close()
            return
    else:
        resumed = False
        if resume_session_id:
            # Cancel any pending cleanup on the old in-memory session before replacing
            old_session = session_manager.get_session(resume_session_id)
            if old_session and hasattr(old_session, '_cleanup_task') and old_session._cleanup_task:  # type: ignore[attr-defined]
                old_session._cleanup_task.cancel()  # type: ignore[attr-defined]
                old_session._cleanup_task = None  # type: ignore[attr-defined]
                logger.info("Cancelled pending cleanup for session %s before restore", resume_session_id)

            # If session is still in memory, reuse it directly (preserves live state)
            if old_session:
                story_session = old_session
                resumed = True
                logger.info("Reusing in-memory session %s (%d scenes)", resume_session_id, story_session.scene_count)
            else:
                # Try to restore from Firestore
                data = await firestore_persistence.load_session(resume_session_id)
                if data and (not user_id or data.get("user_id") == user_id):
                    story_session = firestore_persistence.dict_to_session(data)
                    session_manager._sessions[story_session.session_id] = story_session
                    resumed = True
                    logger.info("Resumed session %s from Firestore (%d scenes)", resume_session_id, story_session.scene_count)
                else:
                    logger.warning("Resume session %s not found or unauthorized, creating new", resume_session_id)

        if not resumed:
            story_session = session_manager.create_session()

    if user_id:
        story_session.user_id = user_id

    session_id = story_session.session_id

    # Determine role and register with ConnectionManager
    AVATAR_COLORS = ["#f59e0b", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#f97316"]
    collab_role = "viewer" if is_viewer else ("host" if not connection_manager.has_host(session_id) else "viewer")
    if collab_role == "viewer":
        is_viewer = True
    collab_color = AVATAR_COLORS[connection_manager.connection_count(session_id) % len(AVATAR_COLORS)]
    collab_info = CollaboratorInfo(
        user_id=user_id or f"anon-{str(uuid.uuid4())[:6]}",
        display_name=display_name or (f"User {connection_manager.connection_count(session_id) + 1}"),
        role=collab_role,
        color=collab_color,
    )
    connection_manager.add(session_id, ws, collab_info)

    # Create ADK session and live queue only for host connections
    adk_session = None
    live_queue = None
    if not is_viewer:
        adk_session = await session_service.create_session(
            app_name="dreamloom",
            user_id=f"user_{session_id}",
        )
        live_queue = LiveRequestQueue()

    def _collaborators_payload() -> list[dict]:
        return [
            {"userId": c.user_id, "displayName": c.display_name, "role": c.role, "color": c.color}
            for c in connection_manager.get_collaborators(session_id)
        ]

    if resumed:
        # Send full restored state to client
        await ws.send_json({
            "type": "session_restored",
            "session_id": session_id,
            "role": collab_role,
            "collaborators": _collaborators_payload(),
            "story": {
                "title": story_session.title,
                "genre": story_session.genre,
                "style": story_session.style,
                "pages": [
                    {
                        "sceneId": s.scene_id,
                        "sceneNumber": i + 1,
                        "title": s.title,
                        "narration": s.narration,
                        "blocks": s.blocks,
                        "imageUrl": s.image_url,
                        "musicUrl": s.music_url,
                        "musicMood": s.mood,
                    }
                    for i, s in enumerate(story_session.scenes)
                ],
            },
            "storyBible": story_session.to_bible_dict(),
            "message": f"Welcome back! Your story \"{story_session.title}\" has been restored.",
        })
    else:
        # Send session info to client
        await ws.send_json({
            "type": "session_start",
            "session_id": session_id,
            "role": collab_role,
            "collaborators": _collaborators_payload(),
            "message": "Welcome to DreamLoom! I'm Loom, your creative director. Tell me about a story you'd like to create.",
        })

    # Notify existing clients about the new collaborator
    await connection_manager.broadcast(session_id, {
        "type": "collaborator_joined",
        "collaborator": {"userId": collab_info.user_id, "displayName": collab_info.display_name, "role": collab_role, "color": collab_color},
        "collaborators": _collaborators_payload(),
    }, exclude=ws)

    async def drain_notifications():
        """Drain the tool notification queue and broadcast to all connected WebSockets.

        Tools push notifications (generating status, scene results, music, etc.)
        to the session's notification_queue. This task broadcasts them to all clients.
        """
        try:
            while True:
                msg = await story_session.notification_queue.get()
                try:
                    await connection_manager.broadcast(session_id, msg)
                    logger.info("Notification broadcast: type=%s to %d clients", msg.get("type"), connection_manager.connection_count(session_id))
                except Exception as broadcast_err:
                    logger.error("Notification broadcast failed (continuing): %s", broadcast_err)
                    continue
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("Notification drain error: %s", e)

    async def handle_agent_responses():
        """Process agent responses and forward to WebSocket client.

        Handles: text output, audio binary, turn events, interruptions.
        Tool results (scenes, music, etc.) come via the notification queue
        instead, which is more reliable across ADK versions.

        Retries the live connection up to 5 times with backoff to handle
        transient 1008 errors from the preview native audio model.
        On retry, re-injects story context and suppresses the agent's
        first response turn (which would be a re-introduction) so the
        user experience is seamless.
        """
        nonlocal live_queue, adk_session

        start_sens = (types.StartSensitivity.START_SENSITIVITY_HIGH
                      if config.vad_start_sensitivity == "HIGH"
                      else types.StartSensitivity.START_SENSITIVITY_LOW)
        end_sens = (types.EndSensitivity.END_SENSITIVITY_HIGH
                    if config.vad_end_sensitivity == "HIGH"
                    else types.EndSensitivity.END_SENSITIVITY_LOW)

        live_run_config = RunConfig(
            response_modalities=["AUDIO"],
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    disabled=False,
                    start_of_speech_sensitivity=start_sens,
                    end_of_speech_sensitivity=end_sens,
                    prefix_padding_ms=config.vad_prefix_padding_ms,
                    silence_duration_ms=config.vad_silence_duration_ms,
                ),
            ),
            proactivity=types.ProactivityConfig(
                proactive_audio=True,
            ),
        )
        max_retries = 5
        # When True, suppress agent output until its first turn completes.
        # This prevents the re-introduction greeting after a reconnect.
        mute_until_turn_complete = False
        # False-interruption recovery state
        last_agent_transcript = ""
        interruption_verify_task = None
        user_spoke_flag = asyncio.Event()
        logger.info("Response handler started for session %s", session_id)

        for attempt in range(1, max_retries + 1):
            try:
                logger.info("Entering run_live (attempt %d/%d)...", attempt, max_retries)
                async for event in runner.run_live(
                    session=adk_session,
                    live_request_queue=live_queue,
                    run_config=live_run_config,
                ):
                    # Handle turn completion
                    if event.turn_complete:
                        last_agent_transcript = ""
                        if mute_until_turn_complete:
                            mute_until_turn_complete = False
                            logger.info("Reconnect greeting suppressed, agent ready for user input")
                            try:
                                await connection_manager.broadcast(session_id, {
                                    "type": "reconnecting",
                                    "attempt": 0,
                                    "max_attempts": max_retries,
                                    "message": "Voice reconnected",
                                })
                            except Exception:
                                pass
                        else:
                            await connection_manager.broadcast(session_id, {"type": "turn_complete"})

                    # Input transcription (user speech -> text)
                    if event.input_transcription and event.input_transcription.text:
                        tx = event.input_transcription.text
                        is_final = event.input_transcription.finished
                        logger.info("User transcript%s: %s", " (final)" if is_final else "", tx[:200])
                        if tx.strip():
                            user_spoke_flag.set()
                        if not mute_until_turn_complete:
                            await connection_manager.broadcast(session_id, {
                                "type": "transcription", "source": "user",
                                "text": tx, "final": is_final,
                            })
                        if is_final and tx.strip():
                            story_session.record_conversation("user", tx)

                    # Output transcription (agent speech -> text)
                    if event.output_transcription and event.output_transcription.text:
                        tx = event.output_transcription.text
                        is_final = event.output_transcription.finished
                        last_agent_transcript += tx
                        logger.info("Agent transcript%s: %s", " (final)" if is_final else "", tx[:200])
                        if not mute_until_turn_complete:
                            await connection_manager.broadcast(session_id, {
                                "type": "transcription", "source": "agent",
                                "text": tx, "final": is_final,
                            })
                        if is_final and tx.strip():
                            story_session.record_conversation("assistant", tx)

                    # Handle interrupted (barge-in) with false-interruption recovery
                    if event.interrupted:
                        logger.info("Agent interrupted (barge-in)")
                        if not mute_until_turn_complete:
                            await connection_manager.broadcast(session_id, {"type": "interrupted"})

                        interrupted_text = last_agent_transcript
                        last_agent_transcript = ""
                        user_spoke_flag.clear()

                        # Cancel any pending verification
                        if interruption_verify_task and not interruption_verify_task.done():
                            interruption_verify_task.cancel()

                        async def verify_interruption(
                            _interrupted_text=interrupted_text,
                        ):
                            try:
                                await asyncio.wait_for(user_spoke_flag.wait(), timeout=0.4)
                                logger.info("Interruption confirmed by user speech")
                            except asyncio.TimeoutError:
                                if not _interrupted_text:
                                    return
                                logger.info("False interruption detected — resuming")
                                resume_hint = _interrupted_text[-150:] if len(_interrupted_text) > 150 else _interrupted_text
                                try:
                                    live_queue.send_content(types.Content(
                                        role="user",
                                        parts=[types.Part(text=(
                                            f"[System: That was a false interruption (background noise, not the user). "
                                            f"Continue speaking naturally from where you left off. "
                                            f'You were saying: "{resume_hint}"]'
                                        ))],
                                    ))
                                except Exception:
                                    pass

                        interruption_verify_task = asyncio.create_task(verify_interruption())

                    # Handle content parts
                    if not event.content or not event.content.parts:
                        continue

                    # While muted, skip forwarding text/audio to the client
                    if mute_until_turn_complete:
                        # Still allow tool calls to go through (they affect story state)
                        for part in event.content.parts:
                            if part.function_call:
                                logger.info("Agent calling tool (during muted reconnect): %s", part.function_call.name)
                            elif part.function_response:
                                logger.info("Tool response (muted): %s", part.function_response.name)
                        continue

                    for part in event.content.parts:
                        # Text output from conversation model
                        if part.text:
                            story_session.record_conversation("assistant", part.text)
                            await connection_manager.broadcast(session_id, {
                                "type": "text",
                                "text": part.text,
                                "turn_complete": False,
                            })

                        # Audio/image inline data from conversation model
                        elif part.inline_data and part.inline_data.data:
                            mime = part.inline_data.mime_type or ""
                            if mime.startswith("audio/"):
                                story_session.record_agent_audio(part.inline_data.data)
                                await connection_manager.broadcast_bytes(session_id, part.inline_data.data)
                            elif mime.startswith("image/"):
                                ext = mime.split("/")[-1]
                                from backend.services.media_handler import media_handler as mh
                                url = mh.save_media(
                                    part.inline_data.data, "image", ext, session_id
                                )
                                await connection_manager.broadcast(session_id, {
                                    "type": "image",
                                    "url": url,
                                    "scene_id": story_session.current_scene.scene_id if story_session.current_scene else "",
                                })

                        # Log function calls and record as conversation milestones
                        # (in native audio mode, tool calls are the only text data that survives)
                        elif part.function_call:
                            logger.info("Agent calling tool: %s", part.function_call.name)
                            args_str = str(part.function_call.args)[:300] if part.function_call.args else ""
                            story_session.record_conversation(
                                "tool_call",
                                f"{part.function_call.name}({args_str})",
                            )

                        elif part.function_response:
                            logger.info(
                                "Tool response: %s -> %s",
                                part.function_response.name,
                                str(part.function_response.response)[:200] if part.function_response.response else "None",
                            )

                # Normal exit from the generator — no retry needed
                break

            except WebSocketDisconnect:
                logger.info("Client disconnected during agent response handling")
                return
            except Exception as e:
                err_str = str(e)
                # 1008 = policy violation, 1011 = deadline expired, 1006 = abnormal close
                err_lower = err_str.lower()
                is_transient = (
                    any(code in err_str for code in ("1006", "1008", "1011"))
                    or "not implemented" in err_lower
                    or "deadline expired" in err_lower
                    or "currently unavailable" in err_lower
                )

                logger.error(
                    "Live API error (attempt %d/%d): %s",
                    attempt, max_retries, e,
                )

                if not is_transient or attempt >= max_retries:
                    # Non-transient or exhausted retries — tell clients
                    try:
                        await connection_manager.broadcast(session_id, {
                            "type": "error",
                            "message": f"Voice connection lost after {attempt} attempt(s). Please reconnect.",
                        })
                    except Exception:
                        pass
                    return

                # Transient error — retry with context restoration
                delay = min(2 ** (attempt - 1), 8)
                logger.info("Transient Live API error — retrying in %ds (attempt %d/%d)...", delay, attempt + 1, max_retries)

                try:
                    await connection_manager.broadcast(session_id, {
                        "type": "reconnecting",
                        "attempt": attempt + 1,
                        "max_attempts": max_retries,
                        "message": f"Voice reconnecting... ({attempt + 1}/{max_retries})",
                    })
                except Exception:
                    return

                await asyncio.sleep(delay)

                # Save session to Firestore before retry so auto-reconnect can restore it
                if story_session.user_id:
                    try:
                        await firestore_persistence.save_session(story_session, story_session.user_id)
                    except Exception as save_err:
                        logger.warning("Failed to save session before retry: %s", save_err)

                # Create fresh queue and ADK session for retry
                live_queue.close()
                live_queue = LiveRequestQueue()
                adk_session = await session_service.create_session(
                    app_name="dreamloom",
                    user_id=f"user_{session_id}",
                )

                # Transcribe buffered user audio so the agent remembers
                # what the user said before the connection dropped.
                tx_client = genai.Client(api_key=config.google_api_key)
                user_transcript = ""
                audio_bytes = story_session.get_audio_bytes()
                if audio_bytes and len(audio_bytes) > 3200:  # at least ~0.1s
                    try:
                        logger.info("Transcribing %d bytes of buffered user audio...", len(audio_bytes))
                        tx_resp = await tx_client.aio.models.generate_content(
                            model="gemini-2.5-flash",
                            contents=types.Content(parts=[
                                types.Part(text="Transcribe the following audio exactly as spoken. Return ONLY the transcript, nothing else."),
                                types.Part(inline_data=types.Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")),
                            ]),
                        )
                        user_transcript = (tx_resp.text or "").strip()
                        if user_transcript:
                            logger.info("Audio transcript: %s", user_transcript[:200])
                            story_session.record_conversation("user", user_transcript)
                    except Exception as tx_err:
                        logger.warning("Audio transcription failed (continuing without): %s", tx_err)

                # Also transcribe agent audio if available
                agent_transcript = ""
                agent_audio_bytes = story_session.get_agent_audio_bytes()
                if agent_audio_bytes and len(agent_audio_bytes) > 3200:
                    try:
                        logger.info("Transcribing %d bytes of agent audio...", len(agent_audio_bytes))
                        tx_resp = await tx_client.aio.models.generate_content(
                            model="gemini-2.5-flash",
                            contents=types.Content(parts=[
                                types.Part(text="Transcribe the following audio. Return ONLY the transcript, nothing else."),
                                types.Part(inline_data=types.Blob(data=agent_audio_bytes, mime_type="audio/pcm;rate=24000")),
                            ]),
                        )
                        agent_transcript = (tx_resp.text or "").strip()
                        if agent_transcript:
                            logger.info("Agent transcript: %s", agent_transcript[:200])
                            story_session.record_conversation("assistant", agent_transcript)
                    except Exception as tx_err:
                        logger.warning("Agent audio transcription failed: %s", tx_err)

                # Re-inject FULL story context so the agent has narrative memory
                story_context = story_session.get_retry_context()
                has_story_state = (
                    story_session.scene_count > 0
                    or story_session.title != "Untitled Story"
                    or story_session.characters
                    or user_transcript
                    or agent_transcript
                )

                if has_story_state:
                    transcript_section = ""
                    if user_transcript:
                        transcript_section = (
                            f"\n\nThe user was just saying (transcribed from audio before the interruption):\n"
                            f'"{user_transcript}"\n'
                            f"Acknowledge what they said and continue naturally from that point."
                        )
                    if agent_transcript:
                        transcript_section += (
                            f"\n\nYou (Loom) were just saying:\n"
                            f'"{agent_transcript}"\n'
                            f"Continue from where you left off."
                        )
                    context_msg = (
                        f"[System: You are resuming an existing story session after a brief connection interruption. "
                        f"Story session ID is {session_id}. Use this for all tool calls. "
                        f"Kid-safe mode is {'ON' if story_session.kid_safe_mode else 'OFF'}. "
                        f"We have already created {story_session.scene_count} scene(s). "
                        f"DO NOT introduce yourself. DO NOT say welcome. DO NOT start a new story. "
                        f"DO NOT re-pitch ideas that were already discussed. "
                        f"DO NOT repeat any previous dialogue or suggestions verbatim. "
                        f"Continue from EXACTLY where you left off — same characters, same plot thread, same creative direction. "
                        f"The user should not notice any interruption.\n\n"
                        f"Full story context:\n{story_context}"
                        f"{transcript_section}]"
                    )
                else:
                    context_msg = (
                        f"[System: Story session ID is {session_id}. Use this for all tool calls. "
                        f"Kid-safe mode is {'ON' if story_session.kid_safe_mode else 'OFF'}. "
                        f"There was a brief voice connection hiccup before the story got started. "
                        f"DO NOT introduce yourself or give a long greeting. "
                        f"Say ONE short sentence like: \"Sorry about that little hiccup! Could you tell me your story idea again?\" "
                        f"Then wait for the user to speak.]"
                    )

                live_queue.send_content(
                    types.Content(
                        role="user",
                        parts=[types.Part(text=context_msg)],
                    )
                )

                # Suppress the agent's greeting when there's story state to restore
                # but no transcripts to respond to. When there IS a transcript,
                # let the agent respond naturally. When there's no state at all,
                # let the agent ask the user to re-share.
                has_transcript = user_transcript or agent_transcript
                if has_story_state and not has_transcript:
                    mute_until_turn_complete = True
                    logger.info("Restored story context for retry attempt %d (%d scenes), muting first turn", attempt + 1, story_session.scene_count)
                else:
                    mute_until_turn_complete = False
                    if has_transcript:
                        logger.info("Retry attempt %d with transcript — agent will continue naturally", attempt + 1)
                    else:
                        logger.info("No story state for retry attempt %d — agent will ask user to re-share idea", attempt + 1)

    # Start background tasks (host only — viewers get broadcasts via ConnectionManager)
    notification_task = None
    response_task = None
    if not is_viewer and live_queue and adk_session:
        notification_task = asyncio.create_task(drain_notifications())

        def _on_notification_done(task: asyncio.Task):
            nonlocal notification_task
            try:
                exc = task.exception()
                if exc:
                    logger.error("Notification drain task crashed, restarting: %s", exc)
                    notification_task = asyncio.create_task(drain_notifications())
                    notification_task.add_done_callback(_on_notification_done)
            except asyncio.CancelledError:
                pass

        notification_task.add_done_callback(_on_notification_done)

        response_task = asyncio.create_task(handle_agent_responses())

        # Log if the response task dies unexpectedly
        def _on_response_done(task: asyncio.Task):
            try:
                exc = task.exception()
                if exc:
                    logger.error("Response task crashed: %s", exc, exc_info=exc)
            except asyncio.CancelledError:
                pass
        response_task.add_done_callback(_on_response_done)

        # Inject session_id into agent context
        if resumed and not join_session_id:
            story_context = story_session.get_story_context()
            live_queue.send_content(
                types.Content(
                    role="user",
                    parts=[types.Part(text=(
                        f"[System: Story session ID is {session_id}. Use this for all tool calls. "
                        f"Kid-safe mode is {'ON' if story_session.kid_safe_mode else 'OFF'}. "
                        f"This is a RESUMED session. The user is returning to an existing story. "
                        f"We already have {story_session.scene_count} scene(s). "
                        f"Greet the user warmly, reference their story title \"{story_session.title}\", "
                        f"and ask what they'd like to do next (continue the story, add scenes, create a Director's Cut, etc.).\n\n"
                        f"Story so far:\n{story_context}]"
                    ))],
                )
            )
        else:
            live_queue.send_content(
                types.Content(
                    role="user",
                    parts=[types.Part(text=f"[System: Story session ID is {session_id}. Use this for all tool calls. Kid-safe mode is ON by default.]")],
                )
            )

    try:
        while True:
            message = await ws.receive()

            if message.get("type") == "websocket.disconnect":
                break

            if "bytes" in message and message["bytes"]:
                # Binary = audio PCM data from microphone (host only)
                if is_viewer:
                    continue
                # Health check: if response_task died, warn and break
                if response_task and response_task.done():
                    logger.error("Response task is dead, cannot send audio")
                    try:
                        await connection_manager.broadcast(session_id, {
                            "type": "error",
                            "message": "Voice connection lost. Please reconnect.",
                        })
                    except Exception:
                        pass
                    break
                audio_data = message["bytes"]
                story_session.record_audio(audio_data)
                try:
                    live_queue.send_realtime(
                        types.Blob(data=audio_data, mime_type="audio/pcm;rate=16000")
                    )
                except Exception:
                    pass  # Queue closed/replaced during retry — drop silently

            elif "text" in message and message["text"]:
                data = json.loads(message["text"])
                msg_type = data.get("type", "")

                if msg_type == "text":
                    # Text message from user — viewers can send text too
                    user_text = data.get("text", "")
                    if user_text:
                        story_session.record_conversation("user", user_text)
                    if live_queue:
                        try:
                            live_queue.send_content(
                                types.Content(
                                    role="user",
                                    parts=[types.Part(text=user_text)],
                                )
                            )
                        except Exception:
                            pass  # Queue closed/replaced during retry
                elif msg_type == "camera_frame":
                    # Camera frame (base64 JPEG) — host only
                    if is_viewer:
                        continue
                    frame_b64 = data.get("data", "")
                    if frame_b64:
                        frame_bytes = base64.b64decode(frame_b64)
                        # Store latest frame for scene generation reference
                        story_session.latest_camera_frame = frame_bytes
                        try:
                            live_queue.send_realtime(
                                types.Blob(
                                    data=frame_bytes,
                                    mime_type="image/jpeg",
                                )
                            )
                        except Exception:
                            pass  # Queue closed/replaced during retry
                elif msg_type == "toggle_kid_safe":
                    story_session.kid_safe_mode = data.get("enabled", True)
                    mode = "ON" if story_session.kid_safe_mode else "OFF"
                    if live_queue:
                        live_queue.send_content(
                            types.Content(
                                role="user",
                                parts=[types.Part(text=f"[System: Kid-safe mode is now {mode}.]")],
                            )
                        )
                elif msg_type == "regenerate_scene":
                    scene_num = data.get("scene_number", 0)
                    if live_queue and 1 <= scene_num <= story_session.scene_count:
                        story_session.scenes[scene_num - 1].stale = True
                        live_queue.send_content(
                            types.Content(
                                role="user",
                                parts=[types.Part(text=(
                                    f"[System: User wants to regenerate Scene {scene_num}. "
                                    f"Call create_scene with the same scene_title but a fresh creative take. "
                                    f"Remove the old scene first.]"
                                ))],
                            )
                        )
                        logger.info("Regenerate requested for scene %d", scene_num)

                elif msg_type == "delete_scene":
                    scene_num = data.get("scene_number", 0)
                    removed = story_session.remove_scene(scene_num)
                    if removed:
                        await connection_manager.broadcast(session_id, {
                            "type": "scene_deleted",
                            "scene_number": scene_num,
                            "scene_id": removed.scene_id,
                        })
                        bible = story_session.to_bible_dict()
                        await connection_manager.broadcast(session_id, {
                            "type": "story_state_update",
                            **bible,
                        })
                        if story_session.user_id:
                            await firestore_persistence.save_session(story_session, story_session.user_id)
                        logger.info("Deleted scene %d (id=%s)", scene_num, removed.scene_id)

                elif msg_type == "undo_delete":
                    scene_id = data.get("scene_id", "")
                    restored = story_session.restore_scene(scene_id)
                    if restored:
                        scene_num = next(
                            (i + 1 for i, s in enumerate(story_session.scenes) if s.scene_id == scene_id),
                            story_session.scene_count,
                        )
                        await connection_manager.broadcast(session_id, {
                            "type": "scene_restored",
                            "scene_id": restored.scene_id,
                            "scene_number": scene_num,
                            "title": restored.title,
                            "narration": restored.narration,
                            "blocks": restored.blocks,
                            "image_url": restored.image_url,
                            "music_url": restored.music_url,
                            "mood": restored.mood,
                            "metadata": restored.metadata,
                        })
                        bible = story_session.to_bible_dict()
                        await connection_manager.broadcast(session_id, {
                            "type": "story_state_update",
                            **bible,
                        })
                        if story_session.user_id:
                            await firestore_persistence.save_session(story_session, story_session.user_id)
                        logger.info("Restored scene %s", scene_id)

                elif msg_type == "update_narration":
                    scene_id = data.get("scene_id", "")
                    block_index = data.get("block_index", 0)
                    content = data.get("content", "")
                    scene = next((s for s in story_session.scenes if s.scene_id == scene_id), None)
                    if scene and 0 <= block_index < len(scene.blocks):
                        scene.blocks[block_index]["content"] = content
                        scene.narration = "\n\n".join(
                            b.get("content", "") for b in scene.blocks if b.get("type") == "text" and b.get("content")
                        )
                        bible = story_session.to_bible_dict()
                        await connection_manager.broadcast(session_id, {
                            "type": "story_state_update",
                            **bible,
                        })
                        if story_session.user_id:
                            await firestore_persistence.save_session(story_session, story_session.user_id)
                        logger.info("Updated narration for scene %s block %d", scene_id, block_index)

                elif msg_type == "reorder_scenes":
                    scene_ids = data.get("scene_ids", [])
                    if story_session.reorder_scenes(scene_ids):
                        bible = story_session.to_bible_dict()
                        await connection_manager.broadcast(session_id, {
                            "type": "story_state_update",
                            **bible,
                        })
                        if story_session.user_id:
                            await firestore_persistence.save_session(story_session, story_session.user_id)
                        logger.info("Reordered scenes: %s", scene_ids)

                elif msg_type == "branch_scene":
                    scene_id = data.get("scene_id", "")
                    parent_scene = next((s for s in story_session.scenes if s.scene_id == scene_id), None)
                    if parent_scene and live_queue:
                        story_session.stale_generation_id = f"branch:{scene_id}"
                        live_queue.send_content(
                            types.Content(
                                role="user",
                                parts=[types.Part(text=(
                                    f'[System: The user wants a "What If?" alternate version of Scene "{parent_scene.title}". '
                                    f"Create a new scene with the same characters and setting but a different narrative direction. "
                                    f"Use the same scene_title but with a different creative take. "
                                    f"The original scene was: {parent_scene.narration[:300]}]"
                                ))],
                            )
                        )
                        logger.info("Branch requested for scene %s", scene_id)

                elif msg_type == "set_voice_style":
                    style = data.get("style", "dramatic")
                    tone_map = {
                        "dramatic": "Speak in a bold, theatrical, dramatic tone with sweeping descriptions.",
                        "gentle": "Speak in a soft, warm, gentle bedtime-story tone with tender descriptions.",
                        "energetic": "Speak in an exciting, fast-paced, energetic tone with vivid action descriptions.",
                        "mysterious": "Speak in a hushed, suspenseful, mysterious tone with atmospheric descriptions.",
                    }
                    tone_prompt = tone_map.get(style, tone_map["dramatic"])
                    if live_queue:
                        live_queue.send_content(
                            types.Content(
                                role="user",
                                parts=[types.Part(text=f"[System: The user changed voice style to '{style}'. {tone_prompt}]")],
                            )
                        )
                    logger.info("Voice style set to: %s", style)

                elif msg_type == "end_turn":
                    if live_queue:
                        live_queue.send_content(
                            types.Content(
                                role="user",
                                parts=[types.Part(text="[User ended turn]")],
                            )
                        )

                elif msg_type == "activity_start":
                    if live_queue:
                        live_queue.send_activity_start()
                        logger.debug("Manual activity_start signal sent")

                elif msg_type == "activity_end":
                    if live_queue:
                        live_queue.send_activity_end()
                        logger.debug("Manual activity_end signal sent")

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: session=%s", session_id)
    except Exception as e:
        logger.error("WebSocket error: %s", e, exc_info=True)
    finally:
        # Remove this connection and notify remaining collaborators
        left_info = connection_manager.remove(session_id, ws)
        remaining = connection_manager.connection_count(session_id)

        if left_info:
            # Notify remaining collaborators
            collaborators_payload = [
                {"userId": c.user_id, "displayName": c.display_name, "role": c.role, "color": c.color}
                for c in connection_manager.get_collaborators(session_id)
            ]
            asyncio.create_task(connection_manager.broadcast(session_id, {
                "type": "collaborator_left",
                "collaborator": {"userId": left_info.user_id, "displayName": left_info.display_name, "role": left_info.role, "color": left_info.color},
                "collaborators": collaborators_payload,
            }))
            logger.info("Collaborator left: %s (role=%s), %d remaining", left_info.display_name, left_info.role, remaining)

        # Only shut down agent/queue when the host connection leaves
        if (remaining == 0 or not is_viewer) and live_queue:
            live_queue.close()
            if notification_task:
                notification_task.cancel()
            if response_task:
                response_task.cancel()
            tasks_to_await = [t for t in [notification_task, response_task] if t]
            if tasks_to_await:
                try:
                    await asyncio.gather(*tasks_to_await, return_exceptions=True)
                except Exception:
                    pass

        # Delay full session removal until all connections are gone
        if remaining == 0:
            async def _deferred_cleanup():
                # Save immediately on disconnect so "Your Stories" sees it
                if story_session.user_id:
                    await firestore_persistence.save_session(story_session, story_session.user_id)
                    logger.info("Final session state saved to Firestore: %s", session_id)
                # Delay removal to allow quick reconnects
                await asyncio.sleep(10)
                session_manager.remove_session(session_id)
                story_session._cleanup_task = None  # type: ignore[attr-defined]
                logger.info("Session cleaned up: %s", session_id)
            cleanup_task = asyncio.create_task(_deferred_cleanup())
            story_session._cleanup_task = cleanup_task  # type: ignore[attr-defined]
            logger.info("Session cleanup scheduled: %s", session_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=config.host, port=config.port)
