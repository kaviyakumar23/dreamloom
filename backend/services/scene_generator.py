"""Scene generator — calls Gemini interleaved model for native text+image output."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field

from google import genai
from google.genai import types as genai_types

from backend.config import config
from backend.services.media_handler import media_handler

logger = logging.getLogger(__name__)


@dataclass
class SceneResult:
    """Result from a scene generation call."""
    blocks: list[dict] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    raw_image_data: list[bytes] = field(default_factory=list)


class SceneGenerator:
    """Generates interleaved text+image scenes using Gemini's native output."""

    def __init__(self) -> None:
        self._client: genai.Client | None = None

    def _get_client(self) -> genai.Client:
        if self._client is None:
            self._client = genai.Client(api_key=config.google_api_key)
        return self._client

    async def generate_scene(
        self,
        prompt: str,
        session_id: str,
        reference_image: bytes | None = None,
        reference_type: str = "sketch",
    ) -> SceneResult:
        """Generate an interleaved text+image scene.

        Args:
            prompt: Rich scene prompt with style, characters, mood.
            session_id: For organizing saved media.
            reference_image: Optional reference image bytes (sketch, camera, or style anchor).
            reference_type: How to use the reference — "sketch" (user drawing),
                "camera" (camera frame), or "style_anchor" (Scene 1 image for consistency).

        Returns:
            SceneResult with blocks, metadata, and raw_image_data.
        """
        start_ms = time.monotonic()
        client = self._get_client()
        model = config.scene_model

        # Build input parts
        contents: list[genai_types.Part | str] = []
        if reference_image:
            contents.append(genai_types.Part(
                inline_data=genai_types.Blob(
                    data=reference_image,
                    mime_type="image/jpeg",
                ),
            ))
            if reference_type == "style_anchor":
                contents.append(
                    "STYLE REFERENCE IMAGE from an earlier scene in this story. You MUST:\n"
                    "1. Match the EXACT art style, color palette, lighting, and rendering technique\n"
                    "2. Any recurring characters MUST look IDENTICAL — same hair, face, outfit, "
                    "body proportions, skin tone, and accessories as shown here\n"
                    "3. Maintain the same level of detail, line quality, and visual atmosphere\n\n"
                )
            else:
                contents.append(
                    "The user sketched this concept. Incorporate its essence into the "
                    "illustrations while maintaining the story's established art style.\n\n"
                )
        contents.append(prompt)

        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=model,
                    contents=contents,
                    config=genai_types.GenerateContentConfig(
                        response_modalities=["TEXT", "IMAGE"],
                        temperature=0.9,
                    ),
                ),
                timeout=90.0,
            )

            blocks: list[dict] = []
            part_order: list[str] = []
            raw_images: list[bytes] = []

            if response.candidates and response.candidates[0].content:
                for part in response.candidates[0].content.parts:
                    if part.text:
                        blocks.append({"type": "text", "content": part.text})
                        part_order.append("text")
                    elif part.inline_data and part.inline_data.mime_type and part.inline_data.data:
                        mime = part.inline_data.mime_type
                        if mime.startswith("image/"):
                            raw_images.append(part.inline_data.data)
                            ext = mime.split("/")[-1]
                            if ext == "jpeg":
                                ext = "jpg"
                            url = media_handler.save_media(
                                part.inline_data.data, "image", ext, session_id
                            )
                            blocks.append({"type": "image", "url": url})
                            part_order.append("image")

            elapsed_ms = int((time.monotonic() - start_ms) * 1000)

            metadata = {
                "model": model,
                "modalities": ["TEXT", "IMAGE"],
                "part_order": part_order,
                "generation_ms": elapsed_ms,
            }

            if not blocks:
                blocks.append({
                    "type": "text",
                    "content": "[Scene generation returned no content. The story continues...]",
                })

            return SceneResult(blocks=blocks, metadata=metadata, raw_image_data=raw_images)

        except asyncio.TimeoutError:
            elapsed_ms = int((time.monotonic() - start_ms) * 1000)
            logger.error("Scene generation timed out after %.1fs", elapsed_ms / 1000)
            return SceneResult(
                blocks=[{"type": "text", "content": "[Scene generation timed out. The story continues...]"}],
                metadata={
                    "model": model,
                    "modalities": ["TEXT", "IMAGE"],
                    "part_order": ["text"],
                    "generation_ms": elapsed_ms,
                    "error": "timeout",
                },
            )

        except Exception as e:
            elapsed_ms = int((time.monotonic() - start_ms) * 1000)
            logger.error("Scene generation failed: %s", e, exc_info=True)
            return SceneResult(
                blocks=[{"type": "text", "content": f"[Scene generation error: {e}]"}],
                metadata={
                    "model": model,
                    "modalities": ["TEXT", "IMAGE"],
                    "part_order": ["text"],
                    "generation_ms": elapsed_ms,
                    "error": str(e),
                },
            )

    async def verify_model(self) -> bool:
        """Verify the scene model is accessible. Returns True if OK."""
        client = self._get_client()
        model = config.scene_model
        try:
            response = await client.aio.models.generate_content(
                model=model,
                contents="Say 'ok' in one word.",
                config=genai_types.GenerateContentConfig(
                    response_modalities=["TEXT"],
                    max_output_tokens=10,
                ),
            )
            logger.info("Scene model verified: %s", model)
            return True
        except Exception as e:
            logger.error("Scene model verification failed for '%s': %s", model, e)
            return False



# Global singleton
scene_generator = SceneGenerator()
