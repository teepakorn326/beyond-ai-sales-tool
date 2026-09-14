import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    model: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")
    rules_url: str = os.getenv("RULES_SERVICE_URL", "http://localhost:8081")
    prompt_version: str = "extract-v1"


settings = Settings()
