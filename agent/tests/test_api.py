"""The HTTP service keeps the approval boundary: a proposal comes back as
`pending`, nothing runs until /resume approves it, and a thread with no
pending approval cannot be resumed."""

import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

from agent.api import create_app
from agent.llm import Turn, tool_turn

from .conftest import make_agent

QUESTION = "เคส 0413 ทำไมยังยื่นไม่ได้ แล้วต้องทำอะไรบ้าง"


def client():
    agent, svc, _ = make_agent([
        tool_turn(("get_extraction", {"doc_id": "doc-en"})),
        Turn(text="The English test expired before the submission date"),
        Turn(text="Case 0413 cannot be lodged: the IELTS has expired (R5)"),
    ])
    return TestClient(create_app(agent, "files", False)), svc


def test_ask_returns_a_pending_proposal_and_resume_runs_it_once():
    c, svc = client()
    r = c.post("/ask", json={"question": QUESTION, "asked_by": "web"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["answer"] is None
    assert body["pending"]["tool"] == "request_document"
    assert body["pending"]["case_id"] == "STU-2026-0413"
    assert svc.ledger.requests == []

    r = c.post("/resume", json={"thread_id": body["thread_id"], "approved": True, "approver": "ploy"})
    assert r.status_code == 200, r.text
    assert r.json()["answer"] and r.json()["pending"] is None
    assert len(svc.ledger.requests) == 1

    # The thread is finished: a second resume has nothing to approve.
    assert c.post("/resume", json={"thread_id": body["thread_id"], "approved": True}).status_code == 404


def test_rejection_records_nothing_and_still_answers():
    c, svc = client()
    tid = c.post("/ask", json={"question": QUESTION}).json()["thread_id"]
    r = c.post("/resume", json={"thread_id": tid, "approved": False, "approver": "ploy"})
    assert r.status_code == 200
    assert svc.ledger.requests == []
    assert "not approved" in r.json()["answer"]


def test_unknown_thread_is_404_and_healthz_reports_backend():
    c, _ = client()
    assert c.post("/resume", json={"thread_id": "nope", "approved": True}).status_code == 404
    assert c.get("/healthz").json() == {"status": "ok", "backend": "files", "model_connected": False}
    assert c.post("/ask", json={"question": ""}).status_code == 422
