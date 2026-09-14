import json
from typing import Any

import anthropic

from .config import settings
from .prompts import build_classify_system, build_system
from .schemas import SCHEMA_FOR, Classification, ExtractionMeta


def _make_client():
    """Bedrock keeps inference inside AWS_REGION under IAM; the direct API
    needs a key. Same SDK, same Messages API either way."""
    if settings.ai_provider == "bedrock":
        return anthropic.AnthropicBedrock(aws_region=settings.aws_region)
    return anthropic.Anthropic(api_key=settings.api_key) if settings.api_key else None


_client = _make_client()

NO_CLIENT = (
    "no model client: set AI_PROVIDER=bedrock with AWS credentials, "
    "or AI_PROVIDER=anthropic with ANTHROPIC_API_KEY"
)


def _system(text: str) -> list[dict[str, Any]]:
    """The system prompt (instructions + JSON schema) is identical for every
    document of a type, so it is marked cacheable. Below the model's minimum
    cacheable size the marker is ignored, which is harmless."""
    return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]


def billable(usage: Any) -> int:
    """Tokens to charge against the daily budget: everything the call read or
    wrote, cache creation and cache reads included."""
    return sum(
        int(getattr(usage, k, 0) or 0)
        for k in ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")
    )


def _blocks(images_b64: list[tuple[str, str]]) -> list[dict[str, Any]]:
    """All pages go in one request. Splitting a transcript page by page loses
    the cumulative GPA, which is usually printed only on the last page."""
    return [
        {
            "type": "image",
            "source": {"type": "base64", "media_type": media, "data": data},
        }
        for media, data in images_b64
    ]


def extract(doc_type: str, images_b64: list[tuple[str, str]]) -> tuple[ExtractionMeta, Any]:
    if _client is None:
        raise RuntimeError(NO_CLIENT)

    model_cls = SCHEMA_FOR[doc_type]
    schema_json = json.dumps(model_cls.model_json_schema(), ensure_ascii=False, indent=2)

    msg = _client.messages.create(
        model=settings.model,
        max_tokens=2048,
        system=_system(build_system(doc_type, schema_json)),
        messages=[
            {
                "role": "user",
                "content": [
                    *_blocks(images_b64),
                    {"type": "text", "text": "<document>above</document>"},
                ],
            }
        ],
    )

    text = "".join(b.text for b in msg.content if b.type == "text").strip()
    text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    # Validation happens here, at the boundary. A malformed response fails
    # loudly instead of flowing into the case file.
    # Usage is returned alongside so the caller can bill it against the
    # daily budget and log the real cost of the call.
    return model_cls.model_validate_json(text), msg.usage


def classify(image_b64: tuple[str, str]) -> tuple[Classification, Any]:
    """One page in, one Classification out. Runs on the small model: the
    question is "what is this", not "what does it say"."""
    if _client is None:
        raise RuntimeError(NO_CLIENT)

    schema_json = json.dumps(Classification.model_json_schema(), ensure_ascii=False, indent=2)
    msg = _client.messages.create(
        model=settings.classify_model,
        max_tokens=256,
        system=_system(build_classify_system(schema_json)),
        messages=[
            {
                "role": "user",
                "content": [
                    *_blocks([image_b64]),
                    {"type": "text", "text": "<document>above</document>"},
                ],
            }
        ],
    )
    text = "".join(b.text for b in msg.content if b.type == "text").strip()
    text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return Classification.model_validate_json(text), msg.usage
