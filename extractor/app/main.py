import base64

import httpx
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from .client import extract
from .config import settings
from .guards import BudgetExceeded, DemoModeViolation, assert_demo_safe, budget
from .logging import emit, timed
from .schemas import SCHEMA_FOR

app = FastAPI(title="visa-doc-checker extractor")


@app.exception_handler(BudgetExceeded)
@app.exception_handler(DemoModeViolation)
async def guard_handler(_, exc: Exception):
    emit("guard_rejected", kind=type(exc).__name__)
    return JSONResponse({"error": str(exc)}, status_code=429)


@app.get("/healthz")
def healthz() -> dict:
    """Liveness. Answers even when dependencies are down."""
    return {"status": "ok", "prompt_version": settings.prompt_version}


@app.get("/readyz")
async def readyz() -> dict:
    """Readiness. Fails if the rules engine is unreachable, because an
    extractor that cannot reach the rules engine would happily extract
    documents and then silently never check them."""
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            r = await c.get(f"{settings.rules_url}/healthz")
            r.raise_for_status()
    except Exception as exc:
        raise HTTPException(503, f"rules engine unreachable: {exc}")

    return {
        "status": "ready",
        "model": settings.model,
        "prompt_version": settings.prompt_version,
        "tokens_remaining_today": budget.remaining(),
    }


@app.post("/extract/{doc_type}")
async def extract_endpoint(doc_type: str, files: list[UploadFile]):
    if doc_type not in SCHEMA_FOR:
        raise HTTPException(400, f"unknown doc_type {doc_type}")

    budget.check()

    images = []
    for f in files:
        raw = await f.read()
        assert_demo_safe(f.filename or "", len(raw))
        images.append((f.content_type or "image/png", base64.b64encode(raw).decode()))

    with timed("extract", doc_type=doc_type, pages=len(images)) as log:
        result, usage = extract(doc_type, images)
        log["input_tokens"] = usage.input_tokens
        log["output_tokens"] = usage.output_tokens
        log["unreadable_fields"] = len(result.fields_unreadable)
        log["low_confidence_fields"] = sum(
            1 for v in result.field_confidence.values() if v == "low"
        )

    budget.record(usage.input_tokens + usage.output_tokens)
    return result.model_dump(mode="json")


@app.post("/check")
async def check(case: dict):
    """Thin proxy to the Go rules engine.

    Nothing on this path touches a language model, and it is not subject to the
    token budget: consistency checking must keep working after the daily cap is
    reached.
    """
    with timed("check", case_id=case.get("case_id")):
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f"{settings.rules_url}/check", json=case)
            r.raise_for_status()
            return r.json()
