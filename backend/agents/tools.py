"""Custom tool definitions for the Director agent.

These are story-management tools the agent calls. Scene generation uses
Gemini's native interleaved text+image output via the scene_generator service.

Tools push notifications to the StorySession's notification_queue so the
WebSocket handler can forward them to the frontend in real-time.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import traceback

from backend.config import config
from backend.services.media_handler import media_handler
from backend.services.music_generator import music_generator
from backend.services.scene_generator import scene_generator
from backend.services.firestore_persistence import firestore_persistence
from backend.services.story_state import session_manager

logger = logging.getLogger(__name__)


def set_story_metadata(
    session_id: str,
    title: str,
    genre: str = "",
    style: str = "",
    world_description: str = "",
    narrator_voice: str = "",
) -> dict:
    """Set the story's title, genre, visual style, world description, and narrator voice.

    Call this at the beginning of a story to establish the creative direction.

    Args:
        session_id: The current story session ID.
        title: The story title.
        genre: Genre (e.g., 'fantasy', 'sci-fi', 'fairy tale', 'noir').
        style: Visual art style (e.g., 'watercolor illustration', 'Studio Ghibli anime',
               'dark gothic oil painting').
        world_description: Brief description of the story world/setting.
        narrator_voice: Narrator voice style (e.g., 'dramatic', 'gentle', 'energetic', 'mysterious').

    Returns:
        Confirmation dict with the story metadata.
    """
    session = session_manager.get_session(session_id)
    if not session:
        return {"error": f"Session {session_id} not found"}

    session.title = title
    if genre:
        session.genre = genre
    if style:
        session.style = style
    if world_description:
        session.world_description = world_description
    if narrator_voice:
        session.narrator_voice = narrator_voice

    result = {
        "status": "ok",
        "title": session.title,
        "genre": session.genre,
        "style": session.style,
        "world": session.world_description,
        "narrator_voice": session.narrator_voice,
    }

    # Notify frontend
    session.notify({"type": "story_metadata", **result})
    session.notify({"type": "story_state_update", **session.to_bible_dict()})

    # Persist to Firestore
    firestore_persistence.save_session_background(session, session.user_id)

    return result


def add_character(
    session_id: str,
    name: str,
    description: str,
) -> dict:
    """Register a character, creature, or important object in the story.

    Use this for EVERY named or recurring visual entity — people, animals,
    magical objects, vehicles, buildings, etc. The description is injected
    verbatim into every future scene prompt to guarantee visual consistency.

    Args:
        session_id: The current story session ID.
        name: Entity name (e.g., "Luna", "Shadow the Wolf", "The Crystal Sword",
              "The Red Wagon").
        description: DETAILED visual description for illustration consistency.
                    For characters: hair color/style, eye color, skin tone, exact
                    clothing/outfit, body type, approximate age, distinguishing
                    features (scars, glasses, accessories).
                    For animals: species, size, fur/feather color and pattern,
                    eye color, any accessories (collar, saddle).
                    For objects: material, color, size relative to characters,
                    distinctive markings or damage, glow effects.
                    Example character: "A 10-year-old girl with long curly red
                    hair, green eyes, freckles, wearing a blue dress with a white
                    apron and brown leather boots."
                    Example animal: "A large grey wolf with bright amber eyes,
                    a scar across the left ear, thick silver-tipped fur."
                    Example object: "An ancient leather-bound book with a brass
                    clasp shaped like a dragon, glowing faintly blue at the edges."

    Returns:
        Confirmation dict.
    """
    session = session_manager.get_session(session_id)
    if not session:
        return {"error": f"Session {session_id} not found"}

    session.characters[name] = description
    if session.current_scene:
        session.current_scene.character_descriptions[name] = description

    result = {
        "status": "ok",
        "character": name,
        "total_characters": len(session.characters),
    }

    # Notify frontend
    session.notify({"type": "story_state_update", **session.to_bible_dict()})

    # Persist to Firestore
    firestore_persistence.save_session_background(session, session.user_id)

    return result


def get_story_context(session_id: str) -> dict:
    """Get the current story context for maintaining coherence.

    Call this to review the story state before making narrative decisions.

    Args:
        session_id: The current story session ID.

    Returns:
        Dict with full story context including characters, scenes, and metadata.
    """
    session = session_manager.get_session(session_id)
    if not session:
        return {"error": f"Session {session_id} not found"}

    return {
        "status": "ok",
        "title": session.title,
        "genre": session.genre,
        "style": session.style,
        "world": session.world_description,
        "characters": session.characters,
        "scene_count": session.scene_count,
        "kid_safe_mode": session.kid_safe_mode,
        "context_summary": session.get_story_context(),
    }


def _build_scene_prompt(
    session_id: str,
    scene_prompt: str,
    style_notes: str = "",
    character_names: list[str] | None = None,
    mood: str = "",
) -> str:
    """Build a rich scene prompt with story context for the interleaved model."""
    session = session_manager.get_session(session_id)
    if not session:
        return scene_prompt

    parts = []

    # Art style
    effective_style = style_notes or session.style
    if effective_style:
        parts.append(f"Art style: {effective_style}")

    # Characters/entities in this scene — detailed visual reference (MANDATORY)
    if character_names:
        char_descs = []
        for name in character_names:
            desc = session.characters.get(name, "")
            if desc:
                char_descs.append(f"- {name}: {desc}")
            else:
                char_descs.append(f"- {name}")
        if char_descs:
            parts.append(
                "ENTITIES IN THIS SCENE (draw them EXACTLY as described — "
                "same hair, eyes, outfit, skin, accessories in EVERY image):\n"
                + "\n".join(char_descs)
            )

    # Always inject ALL registered entities for reference, even if not named
    # in character_names — the model needs the full visual registry
    all_entities = session.characters
    unnamed = {k: v for k, v in all_entities.items()
               if character_names is None or k not in character_names}
    if unnamed:
        other_descs = [f"- {name}: {desc}" for name, desc in unnamed.items()]
        parts.append(
            "OTHER REGISTERED ENTITIES (include if they appear; keep visually identical):\n"
            + "\n".join(other_descs)
        )

    # Mood
    if mood:
        parts.append(f"Mood/atmosphere: {mood}")

    # World context
    if session.world_description:
        parts.append(f"World: {session.world_description}")

    # Genre
    if session.genre:
        parts.append(f"Genre: {session.genre}")

    # Visual continuity notes for consistent art across scenes
    if session.scenes:
        continuity = []
        if effective_style:
            continuity.append(f"SAME art style as all previous scenes: {effective_style}")
        # All character visual descriptions — repeat with emphasis
        if session.characters:
            char_lines = [f"- {name}: {desc}" for name, desc in session.characters.items()]
            continuity.append(
                "CHARACTER VISUAL IDENTITY (MUST be identical to previous scenes — "
                "same hair color/style, same eye color, same skin tone, same outfit, "
                "same body type, same facial features, same accessories):\n"
                + "\n".join(char_lines)
            )
        # Last 2 scenes for setting/mood continuity
        recent = session.scenes[-2:]
        scene_refs = []
        for s in recent:
            ref = f"- Scene \"{s.title}\""
            if s.setting_description:
                ref += f" | Setting: {s.setting_description[:100]}"
            if s.mood:
                ref += f" | Mood: {s.mood}"
            char_names = list(s.character_descriptions.keys())
            if char_names:
                ref += f" | Characters shown: {', '.join(char_names)}"
            scene_refs.append(ref)
        continuity.append("Recent scenes (maintain visual continuity):\n" + "\n".join(scene_refs))
        parts.append("⚠ VISUAL CONTINUITY (CRITICAL):\n" + "\n".join(continuity))

    # Instructions for interleaved output
    parts.append(
        "IMPORTANT: Create this scene as a storybook page. Write narration paragraphs "
        "interleaved with matching illustrations. Each illustration should be a beautiful, "
        "detailed image in the specified art style. Alternate between text and image: "
        "write a paragraph of narration, then generate an illustration that depicts it, "
        "then continue with the next paragraph, and so on. "
        "Generate 2-3 paragraphs with 1-2 illustrations.\n\n"
        "CRITICAL IMAGE RULES (follow ALL of these — violations ruin the story):\n\n"
        "1. ZERO TEXT IN IMAGES — NEVER render any text, words, letters, "
        "numbers, captions, labels, titles, speech bubbles, signs with writing, banners with "
        "words, book covers with titles, name tags, scrolls with writing, or ANY written content "
        "inside the images. Images must be PURELY VISUAL with no readable content whatsoever.\n"
        "   - BAD: a wooden sign that says 'Welcome'\n"
        "   - GOOD: a blank weathered wooden sign covered in ivy\n"
        "   - BAD: a book with a visible title\n"
        "   - GOOD: a closed leather-bound book with an ornate clasp\n\n"
        "2. CHARACTER/ENTITY CONSISTENCY — Every recurring entity MUST be visually "
        "IDENTICAL across all images. Re-read descriptions above and match EVERY detail:\n"
        "   - SAME hair: exact color, length, style\n"
        "   - SAME face: eye color, skin tone, face shape, distinguishing marks\n"
        "   - SAME outfit: exact clothing (blue dress stays blue dress)\n"
        "   - SAME body: height, build, proportions\n"
        "   - SAME accessories: glasses, hat, jewelry, weapon\n"
        "   - SAME objects: a red wagon stays the same red wagon in every scene\n"
        "   Treat entity descriptions as costume/design sheets — follow them to the letter.\n\n"
        "3. STYLE CONSISTENCY — Maintain the exact same art style, color palette, lighting "
        "approach, and rendering technique across all images.\n\n"
        "4. NO DUPLICATES — Never show the same character or object twice in one image. "
        "If there is one protagonist, show ONE person, not two copies. If there is one "
        "cat, show ONE cat. Count the entities before finalizing the image.\n\n"
        "5. PHYSICS & LOGIC — Images must follow real-world logic:\n"
        "   - If characters ride in a car, someone must be driving\n"
        "   - If a character holds an object, their hand must grip it naturally\n"
        "   - Characters must be grounded (standing on surfaces, not floating)\n"
        "   - Shadows and lighting must be consistent within the image\n"
        "   - Proportions must be realistic (a child is shorter than an adult)\n"
        "   - If indoors, show walls/ceiling/floor; if outdoors, show sky/ground\n\n"
        "6. SPATIAL COHERENCE — Characters and objects must be arranged logically:\n"
        "   - Characters interacting must face each other or the relevant object\n"
        "   - Objects mentioned in narration must be visible in the illustration\n"
        "   - Scale must be consistent (a sword isn't bigger than the wielder)\n"
        "   - Background elements should match the described setting\n\n"
        "7. ANATOMY & PROPORTIONS — Human and animal anatomy must be correct:\n"
        "   - Correct number of fingers (5 per hand), limbs, and eyes\n"
        "   - Faces must have natural proportions (eyes, nose, mouth properly placed)\n"
        "   - Animals must match their species anatomy\n"
        "   - No extra limbs, merged body parts, or distorted features"
    )

    parts.append(f"\nScene:\n{scene_prompt}")

    return "\n\n".join(parts)


async def create_scene(
    session_id: str,
    scene_title: str,
    scene_prompt: str,
    style_notes: str = "",
    character_names: str = "",
    mood: str = "",
    reference_image_b64: str = "",
) -> dict:
    """Generate an interleaved text+image scene using Gemini's native output.

    This is the core creative tool. It calls the interleaved model which
    produces text paragraphs and illustrations woven together in a single
    API response — Gemini's native mixed-modality output.

    Generation runs in the background so the Live API connection doesn't
    block for 10-30+ seconds (which would cause 1011 timeouts). Results
    are delivered via the notification queue.

    Args:
        session_id: The current story session ID.
        scene_title: A short title for this scene.
        scene_prompt: Rich description of what happens in this scene.
        style_notes: Art style override (uses story default if empty).
        character_names: Comma-separated names of characters in this scene.
        mood: Mood/atmosphere (e.g., 'mysterious', 'joyful', 'tense').
        reference_image_b64: Optional base64-encoded reference image (e.g., user sketch).

    Returns:
        Dict confirming scene generation was started.
    """
    session = session_manager.get_session(session_id)
    if not session:
        return {"error": f"Session {session_id} not found"}

    # Capture all inputs upfront before dispatch
    char_list = [n.strip() for n in character_names.split(",") if n.strip()] if character_names else []

    full_prompt = _build_scene_prompt(
        session_id=session_id,
        scene_prompt=scene_prompt,
        style_notes=style_notes,
        character_names=char_list,
        mood=mood,
    )

    # Decode reference image if provided, or use latest camera frame, or style anchor
    ref_image: bytes | None = None
    ref_type: str = "sketch"
    if reference_image_b64:
        try:
            ref_image = base64.b64decode(reference_image_b64)
            ref_type = "sketch"
        except Exception:
            logger.warning("Failed to decode reference image, ignoring")
    elif session.latest_camera_frame:
        ref_image = session.latest_camera_frame
        ref_type = "camera"
        logger.info("Using latest camera frame as reference for scene generation")
    elif session.style_reference_image:
        ref_image = session.style_reference_image
        ref_type = "style_anchor"
        logger.info("Using Scene 1 style reference for visual consistency")

    # Capture branch marker atomically before dispatch (Fix 15)
    pending_branch_id: str | None = None
    if session.stale_generation_id and session.stale_generation_id.startswith("branch:"):
        pending_branch_id = session.stale_generation_id.split(":", 1)[1]
        session.stale_generation_id = None  # Clear immediately to prevent race

    # Notify frontend: generation started
    session.notify({
        "type": "generating",
        "active": True,
        "message": "Loom is painting your scene...",
    })

    async def _generate_in_background():
        """Run scene generation in background to avoid blocking the Live API."""
        try:
            result = await asyncio.wait_for(
                scene_generator.generate_scene(
                    prompt=full_prompt,
                    session_id=session_id,
                    reference_image=ref_image,
                    reference_type=ref_type,
                ),
                timeout=90.0,
            )

            # Save first image as style reference after Scene 1
            if not session.style_reference_image and result.raw_image_data:
                session.style_reference_image = result.raw_image_data[0]
                logger.info("Saved Scene 1 style reference image (%d bytes)", len(result.raw_image_data[0]))

            # Build narration from text blocks
            narration = "\n\n".join(
                b["content"] for b in result.blocks if b["type"] == "text" and b.get("content")
            )

            # Create scene in story state
            scene = session.add_scene(
                title=scene_title,
                narration=narration,
                setting_description=scene_prompt,
                mood=mood,
            )
            scene.blocks = result.blocks
            scene.metadata = result.metadata
            scene.character_descriptions = {
                name: session.characters.get(name, "") for name in char_list
            }

            parent_scene_id = pending_branch_id
            branch_siblings: list[str] = []
            if parent_scene_id:
                scene.parent_scene_id = parent_scene_id
                scene.branch_label = "What If?"
                branch_siblings = [
                    s.scene_id for s in session.scenes
                    if s.parent_scene_id == parent_scene_id or s.scene_id == parent_scene_id
                ]

            # Set image_url to first image for backward compat
            for block in result.blocks:
                if block["type"] == "image" and block.get("url"):
                    scene.image_url = block["url"]
                    break

            # Notify frontend: scene ready
            notification: dict = {
                "type": "interleaved_scene",
                "scene_id": scene.scene_id,
                "scene_number": session.scene_count,
                "title": scene_title,
                "blocks": result.blocks,
                "metadata": result.metadata,
            }
            if parent_scene_id:
                notification["parent_scene_id"] = parent_scene_id
                notification["branch_label"] = "What If?"
                notification["branch_siblings"] = branch_siblings
            session.notify(notification)
            session.notify({"type": "generating", "active": False, "message": ""})
            session.notify({"type": "story_state_update", **session.to_bible_dict()})

            # Persist to Firestore
            firestore_persistence.save_session_background(session, session.user_id)
            logger.info("Background scene generation completed: %s", scene_title)

        except asyncio.TimeoutError:
            logger.error("Background scene generation timed out for: %s", scene_title)
            session.notify({"type": "generating", "active": False, "message": ""})
            session.notify({"type": "error", "message": "Scene generation timed out. Please try again."})

        except Exception as e:
            logger.error("Background create_scene failed: %s\n%s", e, traceback.format_exc())
            session.notify({"type": "generating", "active": False, "message": ""})
            session.notify({"type": "error", "message": f"Scene generation failed: {str(e)}"})

    # Fire and forget — scene will arrive via notification queue
    asyncio.create_task(_generate_in_background())

    return {
        "status": "ok",
        "message": f"Scene '{scene_title}' is being generated. You'll see it appear shortly.",
    }


async def generate_music(
    session_id: str,
    mood: str = "wonder",
    tempo: str = "moderate",
    style_description: str = "",
    genre: str = "",
) -> dict:
    """Generate atmospheric background music for the current scene using Lyria.

    Music generation runs in the background and delivers results via the
    notification queue. This returns immediately so the Live API connection
    doesn't sit idle waiting for music (which would cause 1011 timeouts).

    Args:
        session_id: The current story session ID.
        mood: Mood of the music (e.g., 'wonder', 'tension', 'joy', 'mystery', 'adventure').
        tempo: Tempo (e.g., 'slow', 'moderate', 'fast').
        style_description: Additional style notes (e.g., 'orchestral', 'ambient piano').
        genre: Musical genre hint (e.g., 'cinematic', 'folk', 'electronic').

    Returns:
        Dict confirming music generation was started.
    """
    import asyncio

    session = session_manager.get_session(session_id)
    if not session:
        return {"error": f"Session {session_id} not found"}

    # Map tempo to BPM
    tempo_bpm = {"slow": 65, "moderate": 90, "fast": 120}.get(tempo.lower(), 90)

    # Build Lyria prompt from mood + style + genre
    prompt_parts = [mood]
    if style_description:
        prompt_parts.append(style_description)
    if genre:
        prompt_parts.append(genre)
    elif session.genre:
        prompt_parts.append(f"{session.genre} soundtrack")
    lyria_prompt = ", ".join(prompt_parts)

    async def _generate_in_background():
        """Run music generation in background to avoid blocking the Live API."""
        source = "lyria"
        try:
            music_url = await music_generator.generate(
                prompt=lyria_prompt,
                bpm=tempo_bpm,
                duration_seconds=30.0,
                session_id=session_id,
            )
            logger.info("Lyria music generated: %s (prompt=%r, bpm=%d)", music_url, lyria_prompt, tempo_bpm)

        except Exception as e:
            logger.warning("Lyria generation failed, falling back to static loop: %s", e)
            source = "fallback_loop"
            fallback_map = {
                "wonder": "wonder.wav",
                "tension": "tension.wav",
                "joy": "joy.wav",
                "mystery": "mystery.wav",
                "adventure": "adventure.wav",
            }
            fallback_file = fallback_map.get(mood.lower(), "wonder.wav")
            music_url = f"/audio/{fallback_file}"

        # Update current scene
        if session.current_scene:
            session.current_scene.music_url = music_url
            session.current_scene.mood = mood

        # Notify frontend
        session.notify({
            "type": "music",
            "url": music_url,
            "mood": mood,
            "tempo": tempo,
        })
        # Update story bible
        session.notify({"type": "story_state_update", **session.to_bible_dict()})
        # Persist to Firestore
        firestore_persistence.save_session_background(session, session.user_id)
        logger.info("Background music delivered: source=%s, mood=%s", source, mood)

    # Fire and forget — music will arrive via notification queue
    asyncio.create_task(_generate_in_background())

    return {
        "status": "ok",
        "message": "Music generation started in background",
        "mood": mood,
        "tempo": tempo,
    }


async def create_directors_cut(session_id: str) -> dict:
    """Generate the Director's Cut finale package.

    Compiles all scene data into a rich prompt and generates:
    - Cover image (hero shot)
    - Logline (one-sentence story summary)
    - Trailer voiceover text

    The heavy generation runs in the background so the Live API connection
    doesn't time out. Results are delivered via the notification queue.

    The animatic video is assembled client-side from scene images + music.

    Args:
        session_id: The current story session ID.

    Returns:
        Dict confirming generation was started.
    """
    import asyncio

    session = session_manager.get_session(session_id)
    if not session:
        return {"error": f"Session {session_id} not found"}

    if session.scene_count < 1:
        return {"error": "Need at least 1 scene for a Director's Cut"}

    # Notify frontend: generation started
    session.notify({
        "type": "generating",
        "active": True,
        "message": "Preparing the Director's Cut...",
    })

    # Capture data needed for background task (avoid race conditions)
    scene_data = []
    for i, s in enumerate(session.scenes):
        scene_data.append({
            "index": i + 1,
            "title": s.title,
            "narration": s.narration,
            "blocks": list(s.blocks),
        })
    characters = dict(session.characters)
    title = session.title
    genre = session.genre
    style = session.style or "cinematic illustration"

    async def _generate_in_background():
        """Run Director's Cut generation in background to avoid 1011 timeouts."""
        try:
            scene_summaries = [
                f"Scene {sd['index']} ({sd['title']}): {sd['narration'][:200]}"
                for sd in scene_data
            ]

            prompt = (
                f"Create a stunning cover image and story summary for this story:\n\n"
                f"Title: {title}\n"
                f"Genre: {genre}\n"
                f"Art style: {style}\n\n"
                f"Story scenes:\n" + "\n".join(scene_summaries) + "\n\n"
                f"Characters:\n" +
                "\n".join(f"- {n}: {d}" for n, d in characters.items()) + "\n\n"
                f"First, write a compelling one-sentence logline for this story. "
                f"Then generate a dramatic cover illustration that captures the essence "
                f"of the entire story in one image — like a book cover. "
                f"DO NOT include any text, words, or letters in the cover image. "
                f"Characters must look exactly as described above. "
                f"Then write a short 2-sentence trailer voiceover narration."
            )

            result = await scene_generator.generate_scene(
                prompt=prompt,
                session_id=session_id,
            )

            # Extract cover image and text
            cover_url = ""
            texts: list[str] = []
            for block in result.blocks:
                if block["type"] == "image" and block.get("url") and not cover_url:
                    cover_url = block["url"]
                elif block["type"] == "text" and block.get("content"):
                    texts.append(block["content"])

            # Parse logline and trailer from text
            full_text = "\n".join(texts)
            logline = full_text[:200] if full_text else f"The story of {title}"
            trailer_text = full_text[200:] if len(full_text) > 200 else ""

            # Collect scene image URLs for animatic
            scene_images = []
            for sd in scene_data:
                for block in sd["blocks"]:
                    if block["type"] == "image" and block.get("url"):
                        scene_images.append({
                            "url": block["url"],
                            "narration": sd["narration"][:150],
                            "title": sd["title"],
                        })
                        break

            dc_result = {
                "cover_url": cover_url,
                "logline": logline,
                "trailer_text": trailer_text,
                "scene_images": scene_images,
                "metadata": result.metadata,
            }

            # Store on session so it survives reload
            session.directors_cut = dc_result

            # Notify frontend
            session.notify({"type": "generating", "active": False, "message": ""})
            session.notify({"type": "directors_cut", **dc_result})
            # Persist to Firestore
            firestore_persistence.save_session_background(session, session.user_id)
            logger.info("Director's Cut delivered: cover=%s, scenes=%d", cover_url, len(scene_images))

        except Exception as e:
            logger.error("create_directors_cut failed: %s\n%s", e, traceback.format_exc())
            session.notify({"type": "generating", "active": False, "message": ""})
            session.notify({"type": "error", "message": f"Director's Cut failed: {str(e)}"})

    # Fire and forget — results arrive via notification queue
    asyncio.create_task(_generate_in_background())

    return {
        "status": "ok",
        "message": "Director's Cut generation started. The cover, logline, and trailer will appear shortly.",
    }
