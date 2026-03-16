"""Lyria RealTime music generator — streams AI-generated music for story scenes."""

from __future__ import annotations

import asyncio
import io
import logging
import struct
import time

from google import genai
from google.genai import types as genai_types

from backend.config import config
from backend.services.media_handler import media_handler

logger = logging.getLogger(__name__)

# Lyria RealTime outputs 48 kHz stereo 16-bit PCM
SAMPLE_RATE = 48000
NUM_CHANNELS = 2
BITS_PER_SAMPLE = 16
BYTES_PER_SAMPLE = BITS_PER_SAMPLE // 8


def _pcm_to_wav(pcm_data: bytes) -> bytes:
    """Wrap raw PCM bytes in a WAV header (48 kHz stereo 16-bit)."""
    data_size = len(pcm_data)
    byte_rate = SAMPLE_RATE * NUM_CHANNELS * BYTES_PER_SAMPLE
    block_align = NUM_CHANNELS * BYTES_PER_SAMPLE

    buf = io.BytesIO()
    # RIFF header
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    # fmt chunk
    buf.write(b"fmt ")
    buf.write(struct.pack("<I", 16))  # chunk size
    buf.write(struct.pack("<H", 1))  # PCM format
    buf.write(struct.pack("<H", NUM_CHANNELS))
    buf.write(struct.pack("<I", SAMPLE_RATE))
    buf.write(struct.pack("<I", byte_rate))
    buf.write(struct.pack("<H", block_align))
    buf.write(struct.pack("<H", BITS_PER_SAMPLE))
    # data chunk
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    buf.write(pcm_data)
    return buf.getvalue()


class MusicGenerator:
    """Generates music using Google's Lyria RealTime streaming API."""

    def __init__(self) -> None:
        self._client: genai.Client | None = None

    def _get_client(self) -> genai.Client:
        if self._client is None:
            self._client = genai.Client(
                api_key=config.google_api_key,
                http_options={"api_version": "v1alpha"},
            )
        return self._client

    async def generate(
        self,
        prompt: str,
        bpm: int = 90,
        duration_seconds: float = 30.0,
        session_id: str = "",
    ) -> str:
        """Stream music from Lyria RealTime and save as a WAV file.

        Args:
            prompt: Text description of the desired music.
            bpm: Beats per minute.
            duration_seconds: How many seconds of audio to capture.
            session_id: For organizing saved media files.

        Returns:
            URL of the saved WAV file.
        """
        start_ms = time.monotonic()
        client = self._get_client()
        model = config.music_model

        pcm_chunks: list[bytes] = []
        target_bytes = int(duration_seconds * SAMPLE_RATE * NUM_CHANNELS * BYTES_PER_SAMPLE)

        async with client.aio.live.music.connect(model=model) as session:
            # Configure the music generation
            await session.set_weighted_prompts(
                prompts=[genai_types.WeightedPrompt(text=prompt, weight=1.0)]
            )
            await session.set_music_generation_config(
                config=genai_types.LiveMusicGenerationConfig(
                    bpm=bpm,
                    temperature=1.0,
                )
            )
            await session.play()

            total_bytes = 0
            async for message in session.receive():
                if (
                    message.server_content
                    and message.server_content.audio_chunks
                ):
                    chunk = message.server_content.audio_chunks[0].data
                    pcm_chunks.append(chunk)
                    total_bytes += len(chunk)
                    if total_bytes >= target_bytes:
                        break

        pcm_data = b"".join(pcm_chunks)[:target_bytes]
        wav_data = _pcm_to_wav(pcm_data)

        url = media_handler.save_media(wav_data, "music", "wav", session_id)

        elapsed_ms = int((time.monotonic() - start_ms) * 1000)
        logger.info(
            "Lyria music generated: %d bytes WAV in %dms (%.1fs audio, %d BPM)",
            len(wav_data), elapsed_ms, duration_seconds, bpm,
        )
        return url

    async def verify(self) -> bool:
        """Quick verify that Lyria RealTime is accessible."""
        client = self._get_client()
        model = config.music_model
        try:
            async with client.aio.live.music.connect(model=model) as session:
                pass
            logger.info("Music model verified: %s", model)
            return True
        except Exception as e:
            logger.error("Music model verification failed for '%s': %s", model, e)
            return False


# Global singleton
music_generator = MusicGenerator()
