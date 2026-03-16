"""Firestore persistence for story sessions.

Provides save/load/list/delete operations with graceful degradation:
if Firestore is unavailable (no project configured, auth error, etc.),
all operations become no-ops with warnings.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from backend.config import config

logger = logging.getLogger(__name__)


class FirestorePersistence:
    """Async Firestore CRUD for story sessions."""

    COLLECTION = "sessions"
    GALLERY_COLLECTION = "published_stories"

    def __init__(self) -> None:
        self._client: Any = None
        self._available: bool | None = None  # None = not yet checked

    def _get_client(self) -> Any:
        """Lazy-init the Firestore async client. Returns None if unavailable."""
        if self._available is False:
            return None
        if self._client is not None:
            return self._client

        if not config.google_cloud_project:
            logger.warning(
                "GOOGLE_CLOUD_PROJECT not set — Firestore persistence disabled"
            )
            self._available = False
            return None

        try:
            from google.cloud.firestore_v1 import AsyncClient

            self._client = AsyncClient(project=config.google_cloud_project)
            self._available = True
            logger.info(
                "Firestore client initialized (project=%s)", config.google_cloud_project
            )
            return self._client
        except Exception as e:
            logger.warning("Firestore init failed — persistence disabled: %s", e)
            self._available = False
            return None

    # ------------------------------------------------------------------
    # Serialization helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _session_to_dict(session: Any, user_id: str) -> dict:
        """Serialize a StorySession to a Firestore-friendly dict."""
        scenes = []
        for s in session.scenes:
            scenes.append({
                "scene_id": s.scene_id,
                "title": s.title,
                "narration": s.narration,
                "blocks": s.blocks,
                "image_url": s.image_url,
                "music_url": s.music_url,
                "mood": s.mood,
                "character_descriptions": s.character_descriptions,
                "setting_description": s.setting_description,
                "metadata": s.metadata,
                "timestamp": s.timestamp,
            })

        return {
            "session_id": session.session_id,
            "user_id": user_id,
            "title": session.title,
            "genre": session.genre,
            "style": session.style,
            "world_description": session.world_description,
            "characters": session.characters,
            "kid_safe_mode": session.kid_safe_mode,
            "created_at": session.created_at,
            "updated_at": time.time(),
            "scene_count": session.scene_count,
            "scenes": scenes,
        }

    @staticmethod
    def dict_to_session(data: dict) -> Any:
        """Reconstruct a StorySession from a Firestore document dict."""
        from backend.services.story_state import StorySession, StoryScene

        session = StorySession(
            session_id=data.get("session_id", ""),
            title=data.get("title", "Untitled Story"),
            genre=data.get("genre", ""),
            style=data.get("style", ""),
            characters=data.get("characters", {}),
            world_description=data.get("world_description", ""),
            kid_safe_mode=data.get("kid_safe_mode", True),
            created_at=data.get("created_at", time.time()),
        )
        session.user_id = data.get("user_id", "")

        for sd in data.get("scenes", []):
            scene = StoryScene(
                scene_id=sd.get("scene_id", ""),
                title=sd.get("title", ""),
                narration=sd.get("narration", ""),
                blocks=sd.get("blocks", []),
                image_url=sd.get("image_url"),
                music_url=sd.get("music_url"),
                mood=sd.get("mood", ""),
                character_descriptions=sd.get("character_descriptions", {}),
                setting_description=sd.get("setting_description", ""),
                metadata=sd.get("metadata", {}),
                timestamp=sd.get("timestamp", time.time()),
            )
            session.scenes.append(scene)

        return session

    # ------------------------------------------------------------------
    # CRUD operations
    # ------------------------------------------------------------------

    async def save_session(self, session: Any, user_id: str) -> bool:
        """Save (upsert) a session to Firestore. Returns True on success."""
        if not user_id:
            logger.warning("Skipping Firestore save — empty user_id for session %s", getattr(session, "session_id", "?"))
            return False
        client = self._get_client()
        if not client:
            return False

        try:
            doc = self._session_to_dict(session, user_id)
            await client.collection(self.COLLECTION).document(
                session.session_id
            ).set(doc)
            logger.debug("Session saved to Firestore: %s", session.session_id)
            return True
        except Exception as e:
            logger.warning("Firestore save failed: %s", e)
            return False

    def save_session_background(self, session: Any, user_id: str) -> None:
        """Fire-and-forget save via asyncio.create_task."""
        if not user_id:
            return
        client = self._get_client()
        if not client:
            return

        async def _save():
            try:
                await self.save_session(session, user_id)
            except Exception as e:
                logger.warning("Background Firestore save failed: %s", e)

        asyncio.create_task(_save())

    async def load_session(self, session_id: str) -> dict | None:
        """Load a session document. Returns dict or None."""
        client = self._get_client()
        if not client:
            return None

        try:
            doc = await client.collection(self.COLLECTION).document(
                session_id
            ).get()
            if doc.exists:
                return doc.to_dict()
            return None
        except Exception as e:
            logger.warning("Firestore load failed: %s", e)
            return None

    async def list_user_sessions(
        self, user_id: str, limit: int = 20
    ) -> list[dict]:
        """List sessions for a user (summary only — no full scene blocks)."""
        client = self._get_client()
        if not client:
            return []

        try:
            # Filter by user_id only — sort client-side to avoid composite index
            query = (
                client.collection(self.COLLECTION)
                .where("user_id", "==", user_id)
                .limit(limit)
            )
            docs = query.stream()
            results = []
            async for doc in docs:
                data = doc.to_dict()
                # Extract thumbnail from first scene's first image block
                thumbnail = ""
                for scene in data.get("scenes", []):
                    for block in scene.get("blocks", []):
                        if block.get("type") == "image" and block.get("url"):
                            thumbnail = block["url"]
                            break
                    if thumbnail:
                        break

                results.append({
                    "session_id": data.get("session_id", ""),
                    "title": data.get("title", "Untitled Story"),
                    "genre": data.get("genre", ""),
                    "style": data.get("style", ""),
                    "scene_count": data.get("scene_count", 0),
                    "thumbnail": thumbnail,
                    "created_at": data.get("created_at", 0),
                    "updated_at": data.get("updated_at", 0),
                })
            # Sort by most recent first
            results.sort(key=lambda r: r.get("updated_at", 0), reverse=True)
            return results
        except Exception as e:
            logger.warning("Firestore list failed: %s", e)
            return []

    # ------------------------------------------------------------------
    # Gallery (published stories) operations
    # ------------------------------------------------------------------

    async def publish_story(self, data: dict) -> str | None:
        """Save a published story snapshot. Returns publish_id or None."""
        client = self._get_client()
        if not client:
            return None

        try:
            import uuid as _uuid
            publish_id = _uuid.uuid4().hex[:12]
            data["publish_id"] = publish_id
            data["published_at"] = time.time()
            await client.collection(self.GALLERY_COLLECTION).document(
                publish_id
            ).set(data)
            logger.info("Story published: %s", publish_id)
            return publish_id
        except Exception as e:
            logger.warning("Firestore publish failed: %s", e)
            return None

    async def list_published(self, limit: int = 6) -> list[dict]:
        """List published stories (summary only, no private fields)."""
        client = self._get_client()
        if not client:
            return []

        try:
            query = (
                client.collection(self.GALLERY_COLLECTION)
                .order_by("published_at", direction="DESCENDING")
                .limit(limit)
            )
            docs = query.stream()
            results = []
            async for doc in docs:
                d = doc.to_dict()
                results.append({
                    "publish_id": d.get("publish_id", ""),
                    "title": d.get("title", "Untitled"),
                    "genre": d.get("genre", ""),
                    "logline": d.get("logline", ""),
                    "cover_url": d.get("cover_url", ""),
                    "scene_count": d.get("scene_count", 0),
                    "published_at": d.get("published_at", 0),
                })
            return results
        except Exception as e:
            logger.warning("Firestore list_published failed: %s", e)
            return []

    async def get_published(self, publish_id: str) -> dict | None:
        """Get full published story (strips private fields)."""
        client = self._get_client()
        if not client:
            return None

        try:
            doc = await client.collection(self.GALLERY_COLLECTION).document(
                publish_id
            ).get()
            if not doc.exists:
                return None
            d = doc.to_dict()
            d.pop("user_id", None)
            d.pop("session_id", None)
            return d
        except Exception as e:
            logger.warning("Firestore get_published failed: %s", e)
            return None

    async def unpublish_story(self, publish_id: str, user_id: str) -> bool:
        """Delete published story if user_id matches. Returns True on success."""
        client = self._get_client()
        if not client:
            return False

        try:
            doc_ref = client.collection(self.GALLERY_COLLECTION).document(publish_id)
            doc = await doc_ref.get()
            if not doc.exists:
                return False
            if doc.to_dict().get("user_id") != user_id:
                return False
            await doc_ref.delete()
            logger.info("Story unpublished: %s", publish_id)
            return True
        except Exception as e:
            logger.warning("Firestore unpublish failed: %s", e)
            return False

    async def get_user_published(self, user_id: str) -> list[dict]:
        """Return [{publish_id, session_id}] for a user's published stories."""
        client = self._get_client()
        if not client:
            return []

        try:
            query = (
                client.collection(self.GALLERY_COLLECTION)
                .where("user_id", "==", user_id)
            )
            docs = query.stream()
            results = []
            async for doc in docs:
                d = doc.to_dict()
                results.append({
                    "publish_id": d.get("publish_id", ""),
                    "session_id": d.get("session_id", ""),
                })
            return results
        except Exception as e:
            logger.warning("Firestore get_user_published failed: %s", e)
            return []

    async def delete_session(self, session_id: str) -> bool:
        """Delete a session document. Returns True on success."""
        client = self._get_client()
        if not client:
            return False

        try:
            await client.collection(self.COLLECTION).document(
                session_id
            ).delete()
            logger.info("Session deleted from Firestore: %s", session_id)
            return True
        except Exception as e:
            logger.warning("Firestore delete failed: %s", e)
            return False


# Global singleton
firestore_persistence = FirestorePersistence()
