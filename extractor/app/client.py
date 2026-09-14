import json
from typing import Any

import anthropic

from .config import settings
from .prompts import build_system
from .schemas import SCHEMA_FOR, ExtractionMeta

_client = anthropic.Anthropic(api_key=settings.api_key) if settings.api_key else None


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
        raise RuntimeError("ANTHROPIC_API_KEY is not set")

    model_cls = SCHEMA_FOR[doc_type]
    schema_json = json.dumps(model_cls.model_json_schema(), ensure_ascii=False, indent=2)

    msg = _client.messages.create(
        model=settings.model,
        max_tokens=2048,
        system=build_system(doc_type, schema_json),
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
