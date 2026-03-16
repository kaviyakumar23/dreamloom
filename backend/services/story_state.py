"""Story session state management."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class StoryScene:
    """A single scene in the story."""

    scene_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    title: str = ""
    narration: str = ""
    blocks: list[dict] = field(default_factory=list)
    image_url: str | None = None
    music_url: str | None = None
    voice_url: str | None = None
    mood: str = ""
    character_descriptions: dict[str, str] = field(default_factory=dict)
    setting_description: str = ""
    metadata: dict = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)
    stale: bool = False
    parent_scene_id: str | None = None
    branch_label: str = ""


@dataclass
class StorySession:
    """Manages the state of an active story session."""

    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    title: str = "Untitled Story"
    genre: str = ""
    style: str = ""
    narrator_voice: str = ""
    scenes: list[StoryScene] = field(default_factory=list)
    _deleted_scenes: dict[str, StoryScene] = field(default_factory=dict)
    characters: dict[str, str] = field(default_factory=dict)
    world_description: str = ""
    kid_safe_mode: bool = True
    directors_cut: dict | None = None
    stale_generation_id: str | None = None
    style_reference_image: bytes | None = None
    latest_camera_frame: bytes | None = None
    created_at: float = field(default_factory=time.time)
    # Conversation history ring buffer for retry context restoration.
    # Stores recent (role, text) tuples so the agent remembers the
    # conversation flow after a Live API disconnect/reconnect.
    _conversation_history: list[tuple[str, str]] = field(default_factory=list)
    _max_history: int = field(default=20, repr=False)
    # Rolling audio buffer for user voice — enables transcription on retry.
    # Keeps last ~15 seconds of 16kHz 16-bit mono PCM (~480KB).
    _audio_buffer: list[bytes] = field(default_factory=list)
    _audio_buffer_bytes: int = field(default=0, repr=False)
    _audio_max_bytes: int = field(default=480_000, repr=False)  # ~15s at 32KB/s
    # Rolling agent audio buffer — keeps ~15s of agent PCM for transcription on retry.
    _agent_audio_buffer: list[bytes] = field(default_factory=list)
    _agent_audio_buffer_bytes: int = field(default=0, repr=False)
    _agent_audio_max_bytes: int = field(default=480_000, repr=False)
    # Notification queue for tools → frontend communication
    notification_queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=100))

    def notify(self, message: dict) -> None:
        """Push a notification for the frontend (non-blocking)."""
        try:
            self.notification_queue.put_nowait(message)
        except asyncio.QueueFull:
            # Drop oldest item to make room
            try:
                self.notification_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            logger.warning("Notification queue full, dropped oldest message to enqueue: %s", message.get("type"))
            try:
                self.notification_queue.put_nowait(message)
            except asyncio.QueueFull:
                logger.warning("Notification queue still full after drop, message lost: %s", message.get("type"))

    def record_audio(self, data: bytes) -> None:
        """Buffer user audio PCM for transcription on retry."""
        self._audio_buffer.append(data)
        self._audio_buffer_bytes += len(data)
        # Trim from front to stay under max
        while self._audio_buffer_bytes > self._audio_max_bytes and self._audio_buffer:
            removed = self._audio_buffer.pop(0)
            self._audio_buffer_bytes -= len(removed)

    def get_audio_bytes(self) -> bytes:
        """Return buffered audio as a single blob, then clear the buffer."""
        if not self._audio_buffer:
            return b""
        result = b"".join(self._audio_buffer)
        self._audio_buffer.clear()
        self._audio_buffer_bytes = 0
        return result

    def record_agent_audio(self, data: bytes) -> None:
        """Buffer agent audio PCM for transcription on retry."""
        self._agent_audio_buffer.append(data)
        self._agent_audio_buffer_bytes += len(data)
        while self._agent_audio_buffer_bytes > self._agent_audio_max_bytes and self._agent_audio_buffer:
            removed = self._agent_audio_buffer.pop(0)
            self._agent_audio_buffer_bytes -= len(removed)

    def get_agent_audio_bytes(self) -> bytes:
        """Return buffered agent audio as a single blob, then clear the buffer."""
        if not self._agent_audio_buffer:
            return b""
        result = b"".join(self._agent_audio_buffer)
        self._agent_audio_buffer.clear()
        self._agent_audio_buffer_bytes = 0
        return result

    def record_conversation(self, role: str, text: str) -> None:
        """Record a conversation turn for retry context restoration."""
        if not text or text.startswith("[System:"):
            return
        # Trim to keep ring buffer bounded
        self._conversation_history.append((role, text[:500]))
        if len(self._conversation_history) > self._max_history:
            self._conversation_history = self._conversation_history[-self._max_history:]

    def get_conversation_recap(self) -> str:
        """Return recent conversation as a readable recap for context injection."""
        if not self._conversation_history:
            return ""
        lines = []
        for role, text in self._conversation_history:
            if role == "tool_call":
                lines.append(f"[Tool called: {text}]")
            elif role == "user":
                lines.append(f"User: {text}")
            else:
                lines.append(f"Loom: {text}")
        return "\n".join(lines)

    def _invalidate_directors_cut(self) -> None:
        """Clear stale Director's Cut when scenes change."""
        if self.directors_cut:
            logger.info("Invalidating Director's Cut — scenes changed")
            self.directors_cut = None
            self.notify({"type": "directors_cut_invalidated"})

    def add_scene(self, **kwargs: object) -> StoryScene:
        scene = StoryScene(**kwargs)  # type: ignore[arg-type]
        self.scenes.append(scene)
        self._invalidate_directors_cut()
        return scene

    def remove_scene(self, scene_number: int) -> StoryScene | None:
        """Remove a scene by 1-based scene number. Returns the removed scene or None."""
        idx = scene_number - 1
        if 0 <= idx < len(self.scenes):
            scene = self.scenes.pop(idx)
            self._deleted_scenes[scene.scene_id] = scene
            self._invalidate_directors_cut()
            return scene
        return None

    def restore_scene(self, scene_id: str) -> StoryScene | None:
        """Restore a previously deleted scene. Returns the scene or None."""
        scene = self._deleted_scenes.pop(scene_id, None)
        if scene:
            self.scenes.append(scene)
            self.scenes.sort(key=lambda s: s.timestamp)
            self._invalidate_directors_cut()
        return scene

    def reorder_scenes(self, scene_ids: list[str]) -> bool:
        """Reorder scenes by a list of scene IDs. Returns True on success."""
        id_map = {s.scene_id: s for s in self.scenes}
        reordered = [id_map[sid] for sid in scene_ids if sid in id_map]
        if len(reordered) != len(self.scenes):
            return False
        self.scenes = reordered
        self._invalidate_directors_cut()
        return True

    @property
    def current_scene(self) -> StoryScene | None:
        return self.scenes[-1] if self.scenes else None

    @property
    def scene_count(self) -> int:
        return len(self.scenes)

    def get_story_context(self) -> str:
        """Build a context string for the agent to maintain coherence."""
        parts = []
        if self.title != "Untitled Story":
            parts.append(f"Story Title: {self.title}")
        if self.genre:
            parts.append(f"Genre: {self.genre}")
        if self.style:
            parts.append(f"Visual Style: {self.style}")
        if self.narrator_voice:
            parts.append(f"Narrator Voice: {self.narrator_voice}")
        if self.characters:
            chars = "; ".join(f"{name}: {desc}" for name, desc in self.characters.items())
            parts.append(f"Characters: {chars}")
        if self.world_description:
            parts.append(f"World: {self.world_description}")
        if self.scenes:
            recent = self.scenes[-3:]  # Last 3 scenes for context
            scene_summaries = []
            for i, s in enumerate(recent):
                idx = len(self.scenes) - len(recent) + i + 1
                text = s.narration[:200] if s.narration else (s.title or "No narration")
                summary = f"Scene {idx}: {text}"
                scene_summaries.append(summary)
            parts.append("Recent scenes:\n" + "\n".join(scene_summaries))
        if self.directors_cut:
            parts.append("Director's Cut: ALREADY CREATED (cover image, logline, and scene gallery are ready)")
        return "\n".join(parts) if parts else "No story started yet."

    def get_retry_context(self) -> str:
        """Build a comprehensive context string for Live API retry reconnections.

        Unlike get_story_context() which is brief, this includes recent scenes
        with narration so the agent can maintain coherence after losing
        its entire conversation history. Capped to prevent context overflow.
        """
        parts = []
        if self.title != "Untitled Story":
            parts.append(f"Story Title: {self.title}")
        if self.genre:
            parts.append(f"Genre: {self.genre}")
        if self.style:
            parts.append(f"Visual Style: {self.style}")
        if self.narrator_voice:
            parts.append(f"Narrator Voice: {self.narrator_voice}")
        if self.characters:
            chars = "; ".join(f"{name}: {desc}" for name, desc in self.characters.items())
            parts.append(f"Characters: {chars}")
        if self.world_description:
            parts.append(f"World: {self.world_description}")
        if self.scenes:
            # Only include the last 5 scenes with 400 chars each to prevent overflow
            recent_scenes = self.scenes[-5:]
            offset = max(0, len(self.scenes) - 5)
            scene_details = []
            if offset > 0:
                scene_details.append(f"[{offset} earlier scene(s) omitted for brevity]")
            for i, s in enumerate(recent_scenes):
                idx = offset + i + 1
                detail = f"Scene {idx}"
                if s.title:
                    detail += f" — \"{s.title}\""
                if s.mood:
                    detail += f" (mood: {s.mood})"
                text = s.narration[:400] if s.narration else "No narration"
                detail += f": {text}"
                scene_details.append(detail)
            parts.append("Recent scenes:\n" + "\n\n".join(scene_details))
        if self.directors_cut:
            parts.append("Director's Cut: ALREADY CREATED (cover image, logline, and scene gallery are ready)")
        # Include recent conversation so the agent remembers the discussion flow
        recap = self.get_conversation_recap()
        if recap:
            parts.append("Recent conversation:\n" + recap)

        result = "\n".join(parts) if parts else "No story started yet."
        # Hard cap to prevent Live API input overflow
        if len(result) > 8000:
            result = result[:8000] + "\n[...truncated]"
        return result

    def to_bible_dict(self) -> dict:
        """Return serializable story bible for the frontend."""
        scene_summaries = []
        for i, s in enumerate(self.scenes):
            summary: dict = {
                "scene_number": i + 1,
                "title": s.title,
                "narration": s.narration[:300] if s.narration else "",
                "mood": s.mood,
            }
            # Include first image from blocks as thumbnail
            for block in s.blocks:
                if block.get("type") == "image" and block.get("url"):
                    summary["thumbnail"] = block["url"]
                    break
            scene_summaries.append(summary)

        return {
            "title": self.title,
            "genre": self.genre,
            "style": self.style,
            "narrator_voice": self.narrator_voice,
            "world_description": self.world_description,
            "characters": self.characters,
            "scenes": scene_summaries,
            "kid_safe_mode": self.kid_safe_mode,
        }


class StorySessionManager:
    """Manages multiple story sessions."""

    def __init__(self) -> None:
        self._sessions: dict[str, StorySession] = {}

    def create_session(self) -> StorySession:
        session = StorySession()
        self._sessions[session.session_id] = session
        return session

    def get_session(self, session_id: str) -> StorySession | None:
        return self._sessions.get(session_id)

    def remove_session(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


@dataclass
class CollaboratorInfo:
    """Info about a connected collaborator."""
    user_id: str
    display_name: str
    role: str  # "host" or "viewer"
    color: str = ""


class ConnectionManager:
    """Manages multiple WebSocket connections per story session for collaboration."""

    def __init__(self) -> None:
        # session_id -> list of (ws, collaborator_info) tuples
        self._connections: dict[str, list[tuple[object, CollaboratorInfo]]] = {}

    def add(self, session_id: str, ws: object, info: CollaboratorInfo) -> None:
        if session_id not in self._connections:
            self._connections[session_id] = []
        # Remove stale connections for the same user (e.g. page reload)
        self._connections[session_id] = [
            (w, c) for w, c in self._connections[session_id]
            if c.user_id != info.user_id
        ]
        self._connections[session_id].append((ws, info))

    def remove(self, session_id: str, ws: object) -> CollaboratorInfo | None:
        if session_id not in self._connections:
            return None
        conns = self._connections[session_id]
        for i, (w, info) in enumerate(conns):
            if w is ws:
                conns.pop(i)
                if not conns:
                    del self._connections[session_id]
                return info
        return None

    def get_collaborators(self, session_id: str) -> list[CollaboratorInfo]:
        return [info for _, info in self._connections.get(session_id, [])]

    def get_connections(self, session_id: str) -> list[tuple[object, CollaboratorInfo]]:
        return list(self._connections.get(session_id, []))

    def connection_count(self, session_id: str) -> int:
        return len(self._connections.get(session_id, []))

    def has_host(self, session_id: str) -> bool:
        return any(info.role == "host" for _, info in self._connections.get(session_id, []))

    async def broadcast(self, session_id: str, message: dict, exclude: object | None = None) -> None:
        """Send a JSON message to all connections in a session, optionally excluding one."""
        for ws, _ in self._connections.get(session_id, []):
            if ws is exclude:
                continue
            try:
                await ws.send_json(message)  # type: ignore[union-attr]
            except Exception:
                pass

    async def broadcast_bytes(self, session_id: str, data: bytes, exclude: object | None = None) -> None:
        """Send binary data to all connections in a session."""
        for ws, _ in self._connections.get(session_id, []):
            if ws is exclude:
                continue
            try:
                await ws.send_bytes(data)  # type: ignore[union-attr]
            except Exception:
                pass


# Global session manager
session_manager = StorySessionManager()

# Global connection manager for collaborative sessions
connection_manager = ConnectionManager()
