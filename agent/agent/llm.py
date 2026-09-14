"""The one place a model is called. Everything above this file works with a
`Turn`, so evals and tests replace the model with a script and never pay."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from .config import settings


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    args: dict[str, Any]


@dataclass(frozen=True)
class Turn:
    text: str
    tool_calls: tuple[ToolCall, ...] = ()
    stop_reason: str = "end_turn"
    # Content blocks exactly as the API returned them, so they can be appended
    # back verbatim (thinking blocks included). None for scripted turns.
    raw_content: list[dict[str, Any]] | None = None

    def assistant_content(self) -> list[dict[str, Any]]:
        if self.raw_content is not None:
            return self.raw_content
        blocks: list[dict[str, Any]] = []
        if self.text:
            blocks.append({"type": "text", "text": self.text})
        for c in self.tool_calls:
            blocks.append({"type": "tool_use", "id": c.id, "name": c.name, "input": c.args})
        return blocks or [{"type": "text", "text": ""}]


class Model(Protocol):
    def turn(
        self, *, system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None
    ) -> Turn: ...


class AnthropicModel:
    def __init__(self, model: str = settings.model, client: Any = None):
        import anthropic

        self.model = model
        if client is not None:
            self.client = client
        elif settings.ai_provider == "bedrock":
            self.client = anthropic.AnthropicBedrock(aws_region=settings.aws_region)
        else:
            self.client = anthropic.Anthropic()

    def turn(
        self, *, system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None
    ) -> Turn:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": 8000,
            # The system prompt and tool list are stable across every turn of
            # every case; the case-specific material lives in messages.
            "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools
        resp = self.client.messages.create(**kwargs)

        if resp.stop_reason == "refusal":
            return Turn(text="", stop_reason="refusal", raw_content=None)

        text = "".join(b.text for b in resp.content if b.type == "text")
        calls = tuple(
            ToolCall(b.id, b.name, dict(b.input)) for b in resp.content if b.type == "tool_use"
        )
        raw = [b.model_dump(exclude_none=True) for b in resp.content]
        return Turn(text=text, tool_calls=calls, stop_reason=resp.stop_reason, raw_content=raw)


class ScriptedModel:
    """Plays back turns in order. Once the script runs out it returns an
    empty end_turn, so a graph under test always terminates."""

    def __init__(self, turns: list[Turn]):
        self._turns = list(turns)
        self.calls: list[dict[str, Any]] = []

    def turn(
        self, *, system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None
    ) -> Turn:
        self.calls.append({"tools": [t["name"] for t in tools] if tools else [], "n": len(messages)})
        if self._turns:
            return self._turns.pop(0)
        return Turn(text="")


def tool_turn(*calls: tuple[str, dict[str, Any]], text: str = "") -> Turn:
    """Helper for scripts: tool_turn(("get_case", {"case_id": "0413"}))."""
    return Turn(
        text=text,
        tool_calls=tuple(ToolCall(f"call_{i}_{n}", n, a) for i, (n, a) in enumerate(calls)),
        stop_reason="tool_use",
    )
