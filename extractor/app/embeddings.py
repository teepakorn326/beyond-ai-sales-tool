"""The one place an embedding model is called.

Callers (web/app/lib/similar.ts, agent/agent/seed.py, agent/agent/pg.py) send
short PII-free strings: policy text, programme descriptions and case profiles
built from an allowlist. Nothing here logs or stores the text.

Providers, chosen by EMBEDDING_PROVIDER:
  bedrock  Cohere Embed (cohere.embed-*) batched up to 96 texts, or
           Amazon Titan Text Embeddings v2 one text per call.
  openai   text-embedding-3-* with the `dimensions` parameter.
All produce EMBEDDING_DIMS-wide vectors so one schema serves every provider.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Any, Literal

from .config import settings

InputType = Literal["document", "query"]

MAX_TEXTS = 64
MAX_CHARS = 8000
_COHERE_BATCH = 96


class EmbeddingUnavailable(RuntimeError):
    """The configured provider has no usable credentials."""


@dataclass(frozen=True)
class EmbeddingResult:
    vectors: list[list[float]]
    model: str
    dims: int
    # Exact for Titan and OpenAI; an estimate (chars / 4) for Cohere, which
    # returns no token count. Charged to the daily budget either way.
    prompt_tokens: int


def _estimate_tokens(texts: list[str]) -> int:
    return sum(math.ceil(len(t) / 4) for t in texts)


_bedrock_client: Any = None


def _bedrock():
    global _bedrock_client
    if _bedrock_client is None:
        import boto3  # only when the bedrock path is actually used

        session = boto3.Session(region_name=settings.aws_region)
        if session.get_credentials() is None:
            raise EmbeddingUnavailable("no AWS credentials for Bedrock embeddings")
        _bedrock_client = session.client("bedrock-runtime")
    return _bedrock_client


def _bedrock_cohere(texts: list[str], input_type: InputType) -> EmbeddingResult:
    client = _bedrock()
    vectors: list[list[float]] = []
    for i in range(0, len(texts), _COHERE_BATCH):
        body = {
            "texts": texts[i : i + _COHERE_BATCH],
            "input_type": "search_document" if input_type == "document" else "search_query",
            "truncate": "END",
        }
        r = client.invoke_model(
            modelId=settings.embedding_model,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body),
        )
        out = json.loads(r["body"].read())
        vectors.extend(out["embeddings"])
    return EmbeddingResult(vectors, settings.embedding_model, settings.embedding_dims, _estimate_tokens(texts))


def _bedrock_titan(texts: list[str]) -> EmbeddingResult:
    client = _bedrock()
    vectors: list[list[float]] = []
    tokens = 0
    for t in texts:
        r = client.invoke_model(
            modelId=settings.embedding_model,
            contentType="application/json",
            accept="application/json",
            body=json.dumps({"inputText": t, "dimensions": settings.embedding_dims, "normalize": True}),
        )
        out = json.loads(r["body"].read())
        vectors.append(out["embedding"])
        tokens += int(out.get("inputTextTokenCount", 0))
    return EmbeddingResult(vectors, settings.embedding_model, settings.embedding_dims, tokens)


_openai_client: Any = None


def _openai(texts: list[str]) -> EmbeddingResult:
    global _openai_client
    if not settings.openai_api_key:
        raise EmbeddingUnavailable("OPENAI_API_KEY is not set")
    if _openai_client is None:
        from openai import OpenAI

        _openai_client = OpenAI(api_key=settings.openai_api_key)
    r = _openai_client.embeddings.create(
        model=settings.embedding_model, input=texts, dimensions=settings.embedding_dims
    )
    vectors = [d.embedding for d in sorted(r.data, key=lambda d: d.index)]
    return EmbeddingResult(vectors, settings.embedding_model, settings.embedding_dims, r.usage.prompt_tokens)


def embed(texts: list[str], input_type: InputType = "document") -> EmbeddingResult:
    if not texts:
        return EmbeddingResult([], settings.embedding_model, settings.embedding_dims, 0)
    if settings.embedding_provider == "bedrock":
        if settings.embedding_model.startswith("cohere."):
            result = _bedrock_cohere(texts, input_type)
        else:
            result = _bedrock_titan(texts)
    elif settings.embedding_provider == "openai":
        result = _openai(texts)
    else:
        raise EmbeddingUnavailable(f"unknown EMBEDDING_PROVIDER {settings.embedding_provider}")

    # Validation at the boundary: a provider that returns the wrong shape
    # fails here, not as a pgvector dimension error four layers later.
    if len(result.vectors) != len(texts):
        raise RuntimeError("embedding provider returned the wrong number of vectors")
    for v in result.vectors:
        if len(v) != settings.embedding_dims:
            raise RuntimeError(f"embedding width {len(v)} != EMBEDDING_DIMS {settings.embedding_dims}")
    return result


def credentials_present() -> bool:
    """For /readyz. Says whether the provider could be called, without calling it."""
    if settings.embedding_provider == "bedrock":
        import boto3

        return boto3.Session(region_name=settings.aws_region).get_credentials() is not None
    return bool(settings.openai_api_key)
