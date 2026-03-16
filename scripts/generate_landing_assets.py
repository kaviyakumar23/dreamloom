#!/usr/bin/env python3
"""Generate landing page assets using Gemini image and Veo video models.

Usage:
    cd /path/to/google-ai
    python scripts/generate_landing_assets.py [--only hero-session-main] [--skip-video]

Models:
    Images (finals):  gemini-3-pro-image-preview  (Nano Banana Pro)
    Video  (finals):  veo-3.1-generate-preview
"""
from __future__ import annotations

import argparse
import io
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

from google import genai
from google.genai import types as genai_types

# ── Config ──────────────────────────────────────────────────────────────
OUTPUT_DIR = PROJECT_ROOT / "frontend" / "public" / "landing"
IMAGE_MODEL = "gemini-3-pro-image-preview"
IMAGE_MODEL_FALLBACK = "gemini-3.1-flash-image-preview"
VIDEO_MODEL = "veo-3.1-generate-preview"
MAX_RETRIES = 3

STYLE_PREFIX = (
    "Premium cinematic story-studio aesthetic, "
    "teal (#1C9BA3) and coral (#E1854D) accent lighting, "
    "human warmth, high detail, clean composition, "
    "no logos, no watermark, no readable UI text. "
)

# ── Asset definitions ───────────────────────────────────────────────────
IMAGE_ASSETS: list[dict] = [
    {
        "name": "hero-session-main",
        "ext": "webp",
        "prompt": (
            "Photoreal cinematic scene of a parent and child co-creating a "
            "fantasy story by voice in a cozy modern room, glowing illustrated "
            "world elements floating near a laptop, emotional expressions, "
            "shallow depth of field, premium hero composition."
        ),
    },
    {
        "name": "audience-families",
        "ext": "webp",
        "prompt": (
            "Photoreal bedtime storytelling moment with family using voice to "
            "generate story scenes, warm lamp light, cozy blankets, joyful "
            "child reaction, magical visual elements subtly integrated."
        ),
    },
    {
        "name": "audience-teachers",
        "ext": "webp",
        "prompt": (
            "Photoreal classroom where a teacher guides students through "
            "AI-generated story scenes, engaged children pointing and "
            "discussing, inclusive classroom, natural daylight, uplifting "
            "educational energy."
        ),
    },
    {
        "name": "audience-creators",
        "ext": "webp",
        "prompt": (
            "Photoreal young creator at a modern workstation speaking ideas "
            "while rough sketches become polished story visuals, focused "
            "expression, moody cinematic studio lighting, premium creator vibe."
        ),
    },
    {
        "name": "moment-directors-cut",
        "ext": "webp",
        "prompt": (
            "Photoreal polished finale display of completed story package on a "
            "desk: cover artwork, scene thumbnails, recap sequence feel, "
            "premium showcase atmosphere, cinematic top-light."
        ),
    },
    {
        "name": "texture-grain",
        "ext": "png",
        "prompt": (
            "Seamless ultra-subtle organic film grain texture tile, neutral "
            "tone, transparent background, soft non-distracting noise suitable "
            "for premium UI overlay. 512x512 tileable pattern."
        ),
    },
    {
        "name": "landing-og",
        "ext": "png",
        "prompt": (
            "Photoreal social banner composition showing human and AI "
            "co-creating a story by voice, one strong focal moment, high "
            "contrast for thumbnail visibility, premium cinematic look. "
            "Landscape 1200x630 aspect ratio for social sharing."
        ),
    },
]

VIDEO_ASSETS: list[dict] = [
    {
        "name": "hero-loop",
        "ext": "mp4",
        "prompt": (
            "6-second seamless loop. Photoreal storytelling workspace with "
            "gentle camera drift, floating illustrated scene elements and soft "
            "particles, subtle teal and coral light movement, smooth loop, "
            "no text, no UI, cinematic ambiance."
        ),
    },
]


def get_client() -> genai.Client:
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("ERROR: GOOGLE_API_KEY not set. Check your .env file.", file=sys.stderr)
        sys.exit(1)
    return genai.Client(api_key=api_key)


def save_image_from_parts(response, output_path: Path, target_ext: str) -> bool:
    """Extract first image from response parts and save to disk."""
    if not response.candidates or not response.candidates[0].content:
        print(f"  WARNING: No content in response")
        return False

    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.mime_type and part.inline_data.data:
            mime = part.inline_data.mime_type
            if not mime.startswith("image/"):
                continue

            raw_bytes = part.inline_data.data

            # Convert to target format if needed
            if target_ext in ("webp", "png") and mime != f"image/{target_ext}":
                try:
                    from PIL import Image
                    img = Image.open(io.BytesIO(raw_bytes))
                    buf = io.BytesIO()
                    save_fmt = "WEBP" if target_ext == "webp" else "PNG"
                    save_kwargs = {"quality": 90} if target_ext == "webp" else {}
                    img.save(buf, format=save_fmt, **save_kwargs)
                    raw_bytes = buf.getvalue()
                except ImportError:
                    print(f"  WARNING: Pillow not installed, saving as-is ({mime})")

            output_path.write_bytes(raw_bytes)
            size_kb = len(raw_bytes) / 1024
            print(f"  Saved: {output_path.name} ({size_kb:.0f} KB)")
            return True

    print(f"  WARNING: No image parts found in response")
    return False


def generate_image(client: genai.Client, asset: dict) -> bool:
    """Generate a single image asset with retry + fallback to flash model."""
    name = asset["name"]
    ext = asset["ext"]
    prompt = STYLE_PREFIX + asset["prompt"]
    output_path = OUTPUT_DIR / f"{name}.{ext}"

    print(f"\n{'='*60}")
    print(f"Generating: {name}.{ext}")
    print(f"Prompt:     {prompt[:100]}...")

    # Try pro model with retries, then fall back to flash
    models_to_try = [IMAGE_MODEL] * MAX_RETRIES + [IMAGE_MODEL_FALLBACK]
    for attempt, model in enumerate(models_to_try):
        if attempt > 0:
            wait = min(15 * attempt, 60)
            print(f"  Retry {attempt}/{MAX_RETRIES} (waiting {wait}s, model={model})...")
            time.sleep(wait)

        t0 = time.monotonic()
        try:
            print(f"  Model: {model}" + (f" (attempt {attempt+1})" if attempt else ""))
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    temperature=0.8,
                ),
            )
            elapsed = time.monotonic() - t0
            print(f"  API call: {elapsed:.1f}s")
            return save_image_from_parts(response, output_path, ext)

        except Exception as e:
            elapsed = time.monotonic() - t0
            is_503 = "503" in str(e) or "UNAVAILABLE" in str(e)
            print(f"  FAILED after {elapsed:.1f}s: {e}")
            if not is_503:
                return False  # Non-retryable error

    return False


def generate_video(client: genai.Client, asset: dict) -> bool:
    """Generate a single video asset using Veo."""
    name = asset["name"]
    ext = asset["ext"]
    prompt = STYLE_PREFIX + asset["prompt"]
    output_path = OUTPUT_DIR / f"{name}.{ext}"

    print(f"\n{'='*60}")
    print(f"Generating: {name}.{ext}")
    print(f"Model:      {VIDEO_MODEL}")
    print(f"Prompt:     {prompt[:100]}...")

    t0 = time.monotonic()
    try:
        operation = client.models.generate_videos(
            model=VIDEO_MODEL,
            prompt=prompt,
            config=genai_types.GenerateVideosConfig(
                aspect_ratio="16:9",
                duration_seconds=6,
            ),
        )

        # Poll until done
        poll_count = 0
        while not operation.done:
            poll_count += 1
            elapsed = time.monotonic() - t0
            print(f"  Polling... ({elapsed:.0f}s elapsed, attempt {poll_count})")
            time.sleep(10)
            operation = client.operations.get(operation)

        elapsed = time.monotonic() - t0

        if not operation.response or not operation.response.generated_videos:
            print(f"  FAILED after {elapsed:.1f}s: no videos in response")
            return False

        video = operation.response.generated_videos[0]
        # Download video file from API
        client.files.download(file=video.video)
        video.video.save(str(output_path))

        size_mb = output_path.stat().st_size / (1024 * 1024)
        print(f"  Saved: {output_path.name} ({size_mb:.1f} MB) in {elapsed:.1f}s")
        return True

    except Exception as e:
        elapsed = time.monotonic() - t0
        print(f"  FAILED after {elapsed:.1f}s: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Generate DreamLoom landing page assets")
    parser.add_argument(
        "--only",
        type=str,
        help="Generate only this asset (by name, e.g. 'hero-session-main')",
    )
    parser.add_argument(
        "--skip-video",
        action="store_true",
        help="Skip video generation (images only)",
    )
    parser.add_argument(
        "--skip-images",
        action="store_true",
        help="Skip image generation (video only)",
    )
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    client = get_client()

    results: list[tuple[str, bool]] = []

    # Filter assets if --only specified
    images = IMAGE_ASSETS if not args.skip_images else []
    videos = VIDEO_ASSETS if not args.skip_video else []

    if args.only:
        images = [a for a in images if a["name"] == args.only]
        videos = [v for v in videos if v["name"] == args.only]
        if not images and not videos:
            print(f"ERROR: No asset named '{args.only}' found.", file=sys.stderr)
            sys.exit(1)

    total = len(images) + len(videos)
    print(f"DreamLoom Landing Asset Generator")
    print(f"Output:  {OUTPUT_DIR}")
    print(f"Assets:  {len(images)} images + {len(videos)} videos = {total} total")

    # Generate images
    for i, asset in enumerate(images, 1):
        print(f"\n[{i}/{total}]", end="")
        ok = generate_image(client, asset)
        results.append((f"{asset['name']}.{asset['ext']}", ok))
        # Brief pause between API calls to avoid rate limits
        if i < len(images):
            time.sleep(2)

    # Generate videos
    for i, asset in enumerate(videos, len(images) + 1):
        print(f"\n[{i}/{total}]", end="")
        ok = generate_video(client, asset)
        results.append((f"{asset['name']}.{asset['ext']}", ok))

    # Summary
    print(f"\n{'='*60}")
    print("RESULTS:")
    succeeded = 0
    for name, ok in results:
        status = "OK" if ok else "FAILED"
        print(f"  {status:6s}  {name}")
        if ok:
            succeeded += 1
    print(f"\n{succeeded}/{total} assets generated successfully")
    print(f"Output directory: {OUTPUT_DIR}")

    if succeeded < total:
        sys.exit(1)


if __name__ == "__main__":
    main()
