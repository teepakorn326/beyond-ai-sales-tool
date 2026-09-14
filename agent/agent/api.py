"""HTTP front for the agent, for the web tier.

    uvicorn agent.api:app --port 8090

POST /ask     {question, asked_by}            -> {thread_id, answer, pending}
POST /resume  {thread_id, approved, approver, note} -> same shape
GET  /healthz                                  -> {status, backend, model_connected}

A pending approval is a LangGraph interrupt held by the in-memory
checkpointer, so it lives in this process only: a restart, or a second
replica, loses it and /resume answers 404 ("ask again"). Fine for a demo with
one agent container; a shared checkpointer is the change for anything more.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .config import settings
from .graph import Agent, Deps
from .llm import AnthropicModel, ScriptedModel
from .tools import build_registry


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    asked_by: str = "web"


class Pending(BaseModel):
    tool: str
    args: dict[str, Any]
    reason: str
    case_id: str | None = None


class RunResponse(BaseModel):
    thread_id: str
    answer: str | None
    pending: Pending | None


class ResumeRequest(BaseModel):
    thread_id: str = Field(min_length=1, max_length=64)
    approved: bool
    approver: str = "web"
    note: str = ""


def create_app(agent: Agent, backend: str, model_connected: bool) -> FastAPI:
    app = FastAPI(title="visa-doc-checker agent")

    def to_response(r) -> RunResponse:
        pending = None
        if r.pending:
            pending = Pending(
                tool=str(r.pending.get("tool")),
                args=dict(r.pending.get("args") or {}),
                reason=str(r.pending.get("reason", "")),
                case_id=r.pending.get("case_id"),
            )
        return RunResponse(thread_id=r.thread_id, answer=r.answer, pending=pending)

    @app.get("/healthz")
    def healthz() -> dict[str, Any]:
        return {"status": "ok", "backend": backend, "model_connected": model_connected}

    @app.post("/ask", response_model=RunResponse)
    def ask(req: AskRequest) -> RunResponse:
        return to_response(agent.ask(req.question, asked_by=req.asked_by))

    @app.post("/resume", response_model=RunResponse)
    def resume(req: ResumeRequest) -> RunResponse:
        state = agent.graph.get_state(agent._config(req.thread_id))
        if not state.values or not state.next:
            raise HTTPException(404, "No pending approval for this thread; ask the question again")
        return to_response(
            agent.resume(req.thread_id, approved=req.approved, approver=req.approver, note=req.note)
        )

    return app


def _default_app() -> FastAPI:
    from .wiring import backend_name, build_services

    svc = build_services(audit_emit=True)
    has_model = settings.ai_provider == "bedrock" or bool(settings.api_key)
    model = AnthropicModel() if has_model else ScriptedModel([])
    agent = Agent(Deps(model=model, registry=build_registry(svc), services=svc))
    return create_app(agent, backend_name(), has_model)


app = _default_app()
