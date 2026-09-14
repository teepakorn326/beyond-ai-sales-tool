import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    # "bedrock" keeps inference in AWS_REGION under IAM; "anthropic" is the
    # direct API with a key. Same SDK either way (see llm.py).
    ai_provider: str = os.getenv("AI_PROVIDER", "bedrock")
    aws_region: str = os.getenv("AWS_REGION", "ap-southeast-2")
    api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    # On Bedrock this is an inference-profile id (apac.anthropic.claude-...).
    model: str = os.getenv("AGENT_MODEL", "claude-opus-5")
    rules_url: str = os.getenv("RULES_SERVICE_URL", "http://localhost:8081")
    # Where the web tier keeps confirmed documents. The agent reads
    # confirmed_json from here and nothing else.
    web_data_dir: str = os.getenv("WEB_DATA_DIR", "../web/.data")
    max_iterations: int = int(os.getenv("AGENT_MAX_ITERATIONS", "6"))
    # Set DATABASE_URL to read cases, policies and programmes from Postgres
    # instead of the file store; EXTRACTOR_URL is where /embed lives.
    database_url: str = os.getenv("DATABASE_URL", "")
    extractor_url: str = os.getenv("EXTRACTOR_URL", "")
    # Recorded on seeded rows so a model change is visible in the table.
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "cohere.embed-multilingual-v3")
    port: int = int(os.getenv("PORT", "8090"))
    prompt_version: str = "agent-v1"


settings = Settings()
