"""POST /embed: shape, limits and budget accounting. The provider is
monkeypatched, so no network and no credentials."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import main
from app.embeddings import MAX_CHARS, MAX_TEXTS, EmbeddingResult


@pytest.fixture
def client(monkeypatch, tmp_path):
    # A fresh budget file per test, far from the real STATE path.
    monkeypatch.setattr(main.budget.__class__, "_load", lambda self: {"date": "x", "used": self.__dict__.get("_used", 0)})
    monkeypatch.setattr(main.budget.__class__, "record", lambda self, tokens: self.__dict__.__setitem__("_used", self.__dict__.get("_used", 0) + tokens))
    main.budget.__dict__.pop("_used", None)
    calls: list[tuple[list[str], str]] = []

    def fake_embed(texts, input_type="document"):
        calls.append((list(texts), input_type))
        return EmbeddingResult([[0.1] * 1024 for _ in texts], "fake-model", 1024, sum(len(t) // 4 + 1 for t in texts))

    monkeypatch.setattr(main, "embed", fake_embed)
    c = TestClient(main.app)
    c.calls = calls  # type: ignore[attr-defined]
    return c


def test_happy_path_returns_one_vector_per_text_and_bills_tokens(client):
    r = client.post("/embed", json={"texts": ["institution: X; qualification: Y", "hello"], "input_type": "query"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["embeddings"]) == 2 and body["dims"] == 1024 and body["model"] == "fake-model"
    assert client.calls == [(["institution: X; qualification: Y", "hello"], "query")]
    assert main.budget.__dict__["_used"] > 0


def test_default_input_type_is_document(client):
    client.post("/embed", json={"texts": ["a"]})
    assert client.calls[0][1] == "document"


def test_empty_and_oversized_batches_are_rejected(client):
    assert client.post("/embed", json={"texts": []}).status_code == 422
    assert client.post("/embed", json={"texts": ["a"] * (MAX_TEXTS + 1)}).status_code == 422
    assert client.calls == []


def test_overlong_text_is_rejected_before_any_call(client):
    r = client.post("/embed", json={"texts": ["x" * (MAX_CHARS + 1)]})
    assert r.status_code == 413
    assert client.calls == []


def test_exhausted_budget_blocks_embedding(client):
    main.budget.__dict__["_used"] = main.budget.limit
    r = client.post("/embed", json={"texts": ["a"]})
    assert r.status_code == 429
    assert client.calls == []


def test_readyz_reports_providers(monkeypatch):
    async def ok(*a, **k):
        class R:
            def raise_for_status(self):
                pass

        return R()

    class FakeAsyncClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        get = ok

    monkeypatch.setattr(main.httpx, "AsyncClient", FakeAsyncClient)
    body = TestClient(main.app).get("/readyz").json()
    assert {"provider", "embedding_provider", "embedding_dims", "model_credentials", "embedding_credentials"} <= body.keys()
