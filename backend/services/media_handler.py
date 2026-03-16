"""Media asset handling — GCS upload/download and URL generation."""

from __future__ import annotations

import base64
import logging
import os
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

# Local media storage fallback (when GCS is not configured)
LOCAL_MEDIA_DIR = Path(__file__).parent.parent / "media_assets"
LOCAL_MEDIA_DIR.mkdir(exist_ok=True)


class MediaHandler:
    """Handles media asset storage and URL generation.

    Uses GCS when configured, falls back to local filesystem for development.
    """

    def __init__(self, bucket_name: str = "", base_url: str = ""):
        self.bucket_name = bucket_name
        self.base_url = base_url or "/media"
        self._gcs_client = None
        self._bucket = None

        if bucket_name:
            try:
                from google.cloud import storage
                self._gcs_client = storage.Client()
                self._bucket = self._gcs_client.bucket(bucket_name)
                logger.info("GCS media handler initialized: %s", bucket_name)
            except Exception as e:
                logger.warning("GCS not available, using local storage: %s", e)

    def save_media(
        self,
        data: bytes,
        media_type: str,
        extension: str,
        session_id: str = "",
    ) -> str:
        """Save media data and return a URL.

        Args:
            data: Raw media bytes.
            media_type: One of 'image', 'audio', 'video'.
            extension: File extension (e.g., 'png', 'mp3', 'mp4').
            session_id: Optional session ID for organizing files.

        Returns:
            URL string for accessing the media.
        """
        filename = f"{media_type}_{uuid.uuid4().hex[:12]}.{extension}"
        path = f"{session_id}/{filename}" if session_id else filename

        if self._bucket:
            return self._save_to_gcs(data, path, media_type, extension)
        return self._save_local(data, path)

    def save_base64_media(
        self,
        b64_data: str,
        media_type: str,
        extension: str,
        session_id: str = "",
    ) -> str:
        """Save base64-encoded media data and return a URL."""
        data = base64.b64decode(b64_data)
        return self.save_media(data, media_type, extension, session_id)

    def _save_to_gcs(self, data: bytes, path: str, media_type: str, extension: str) -> str:
        """Upload to GCS and return public URL. Falls back to local on failure."""
        content_types = {
            ("image", "png"): "image/png",
            ("image", "jpeg"): "image/jpeg",
            ("image", "jpg"): "image/jpeg",
            ("audio", "mp3"): "audio/mpeg",
            ("audio", "wav"): "audio/wav",
            ("video", "mp4"): "video/mp4",
        }
        content_type = content_types.get((media_type, extension), "application/octet-stream")

        try:
            blob = self._bucket.blob(f"dreamloom/{path}")
            blob.upload_from_string(data, content_type=content_type)
            blob.make_public()
            return blob.public_url
        except Exception as e:
            logger.warning("GCS upload failed, falling back to local storage: %s", e)
            return self._save_local(data, path)

    def _save_local(self, data: bytes, path: str) -> str:
        """Save locally and return a local URL."""
        full_path = LOCAL_MEDIA_DIR / path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_bytes(data)
        return f"{self.base_url}/{path}"

    def get_local_path(self, url: str) -> Path | None:
        """Convert a local media URL back to a file path."""
        prefix = f"{self.base_url}/"
        if url.startswith(prefix):
            relative = url[len(prefix):]
            return LOCAL_MEDIA_DIR / relative
        return None


# Global media handler — reads GCS config from env at import time
media_handler = MediaHandler(
    bucket_name=os.getenv("GCS_BUCKET_NAME", ""),
    base_url="/media",
)
