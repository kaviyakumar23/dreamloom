"""DreamLoom backend configuration."""

import os
from dataclasses import dataclass, field


@dataclass
class Config:
    # Google AI
    google_api_key: str = ""
    google_cloud_project: str = ""
    google_cloud_region: str = "us-central1"

    # GCS
    gcs_bucket_name: str = "dreamloom-media-assets"

    # Models
    scene_model: str = "gemini-2.5-flash-image"
    conversation_model: str = "gemini-2.5-flash-native-audio-latest"
    music_model: str = "models/lyria-realtime-exp"

    # VAD tuning
    vad_start_sensitivity: str = "LOW"
    vad_end_sensitivity: str = "LOW"
    vad_prefix_padding_ms: int = 300
    vad_silence_duration_ms: int = 1200

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = field(default_factory=lambda: [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
    ])

    @classmethod
    def from_env(cls) -> "Config":
        cors_raw = os.getenv("CORS_ORIGINS", "")
        cors = [o.strip() for o in cors_raw.split(",") if o.strip()] if cors_raw else []

        return cls(
            google_api_key=os.getenv("GOOGLE_API_KEY", ""),
            google_cloud_project=os.getenv("GOOGLE_CLOUD_PROJECT", ""),
            google_cloud_region=os.getenv("GOOGLE_CLOUD_REGION", "us-central1"),
            gcs_bucket_name=os.getenv("GCS_BUCKET_NAME", "dreamloom-media-assets"),
            scene_model=os.getenv("SCENE_MODEL", "gemini-2.5-flash-image"),
            conversation_model=os.getenv("CONVERSATION_MODEL", "gemini-2.5-flash-native-audio-latest"),
            music_model=os.getenv("MUSIC_MODEL", "models/lyria-realtime-exp"),

            vad_start_sensitivity=os.getenv("VAD_START_SENSITIVITY", "LOW"),
            vad_end_sensitivity=os.getenv("VAD_END_SENSITIVITY", "LOW"),
            vad_prefix_padding_ms=int(os.getenv("VAD_PREFIX_PADDING_MS", "300")),
            vad_silence_duration_ms=int(os.getenv("VAD_SILENCE_DURATION_MS", "1200")),

            host=os.getenv("HOST", "0.0.0.0"),
            port=int(os.getenv("PORT", "8000")),
            cors_origins=cors or [
                "http://localhost:5173",
                "http://localhost:5174",
                "http://localhost:3000",
            ],
        )


config = Config.from_env()
