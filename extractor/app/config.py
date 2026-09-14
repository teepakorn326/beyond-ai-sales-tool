import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    # Which door the model calls go through. "bedrock" keeps inference inside
    # AWS_REGION under IAM; "anthropic" is the direct API with a key.
    ai_provider: str = os.getenv("AI_PROVIDER", "bedrock")
    aws_region: str = os.getenv("AWS_REGION", "ap-southeast-2")
    api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    # On Bedrock these are inference-profile ids (apac.anthropic.claude-...).
    model: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")
    # Classification is "what is this page", a small-model job.
    classify_model: str = os.getenv("ANTHROPIC_CLASSIFY_MODEL", "claude-haiku-4-5")
    rules_url: str = os.getenv("RULES_SERVICE_URL", "http://localhost:8081")
    prompt_version: str = "extract-v1"

    # Embeddings. The extractor is the only service that calls an embedding
    # model; the web tier and the agent go through POST /embed.
    embedding_provider: str = os.getenv("EMBEDDING_PROVIDER", "bedrock")
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "cohere.embed-multilingual-v3")
    embedding_dims: int = int(os.getenv("EMBEDDING_DIMS", "1024"))
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")


settings = Settings()
