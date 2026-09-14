"""Tool risk levels, enforced at the one place every tool call passes through.

Grouping tools by risk is only worth something if the grouping is checked by
code rather than remembered by a prompt. `ToolRegistry.execute` is that check:

    READ        runs freely
    REVERSIBLE  runs freely, always written to the audit log
    EXTERNAL    refuses to run unless handed an `Approval` that names this
                exact tool and these exact arguments

A model can *ask* for an external tool at any time. The registry turns that
ask into `RequiresApproval`, which the graph converts into a proposal for a
person to accept or reject. There is no code path from a model output to an
external side effect that does not go through a human.
"""

from __future__ import annotations

import enum
import hashlib
import json
import uuid
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any


class Risk(enum.Enum):
    READ = "read"
    REVERSIBLE = "reversible"
    EXTERNAL = "external"


def args_digest(args: Mapping[str, Any]) -> str:
    canonical = json.dumps(args, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class Approval:
    """Evidence that a person approved one specific call. Bound to the tool
    name and an argument digest so an approval for "request a passport" can
    never be reused to send a message."""

    tool: str
    args_digest: str
    approver: str
    note: str = ""
    id: str = field(default_factory=lambda: uuid.uuid4().hex)


class ToolError(Exception):
    """Base for errors that are reported back to the model as a tool_result."""


class ToolNotFound(ToolError):
    pass


class ToolInputError(ToolError):
    pass


class RequiresApproval(Exception):
    """Raised when an EXTERNAL tool is called without an approval."""

    def __init__(self, tool: str, args: Mapping[str, Any]):
        super().__init__(f"{tool} requires human approval")
        self.tool = tool
        # Not `self.args`: BaseException.args is a tuple and would silently
        # keep only the dict's keys.
        self.tool_args = dict(args)


class RiskViolation(Exception):
    """An approval was presented for a different tool or different arguments."""


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    input_schema: dict[str, Any]
    risk: Risk
    handler: Callable[..., Any]

    def api_definition(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
        }


class AuditSink:
    """Minimal interface the registry needs. The real sink is in services."""

    def record(self, **fields: Any) -> None:  # pragma: no cover - interface
        raise NotImplementedError


class ToolRegistry:
    def __init__(self, tools: Iterable[Tool], audit: AuditSink):
        self._tools = {t.name: t for t in tools}
        self._audit = audit

    def get(self, name: str) -> Tool:
        try:
            return self._tools[name]
        except KeyError:
            raise ToolNotFound(f"No tool named {name}") from None

    def names(self, *risks: Risk) -> list[str]:
        return [t.name for t in self._tools.values() if not risks or t.risk in risks]

    def definitions(self) -> list[dict[str, Any]]:
        return [t.api_definition() for t in self._tools.values()]

    def _validate(self, tool: Tool, args: Mapping[str, Any]) -> None:
        schema = tool.input_schema
        allowed = set(schema.get("properties", {}))
        required = set(schema.get("required", []))
        missing = required - set(args)
        unknown = set(args) - allowed
        if missing or unknown:
            parts = []
            if missing:
                parts.append(f"missing {sorted(missing)}")
            if unknown:
                parts.append(f"unknown {sorted(unknown)}")
            raise ToolInputError(f"{tool.name}: " + ", ".join(parts))

    def execute(
        self,
        name: str,
        args: Mapping[str, Any],
        *,
        approval: Approval | None = None,
        actor: str = "agent",
    ) -> Any:
        tool = self.get(name)
        self._validate(tool, args)

        if tool.risk is Risk.EXTERNAL:
            if approval is None:
                raise RequiresApproval(name, args)
            if approval.tool != name or approval.args_digest != args_digest(args):
                raise RiskViolation(
                    f"approval {approval.id} is for {approval.tool}, not this call"
                )

        try:
            result = tool.handler(**args)
        except TypeError as exc:
            raise ToolInputError(f"{name}: {exc}") from exc

        if tool.risk is not Risk.READ:
            # Shapes only: which tool, which keys, who approved. Never the
            # values, which may be document content.
            self._audit.record(
                event="tool_call",
                tool=name,
                risk=tool.risk.value,
                arg_keys=sorted(args),
                actor=actor,
                approval_id=approval.id if approval else None,
                approver=approval.approver if approval else None,
            )
        return result
