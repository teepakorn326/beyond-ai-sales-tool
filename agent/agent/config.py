import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    model: str = os.getenv("AGENT_MODEL", "claude-opus-5")
    rules_url: str = os.getenv("RULES_SERVICE_URL", "http://localhost:8081")
    # Where the web tier keeps confirmed documents. The agent reads
    # confirmed_json from here and nothing else.
    web_data_dir: str = os.getenv("WEB_DATA_DIR", "../web/.data")
    max_iterations: int = int(os.getenv("AGENT_MAX_ITERATIONS", "6"))
    prompt_version: str = "agent-v1"


settings = Settings()
