"""Shared fixtures: an in-memory world with one seeded case, and a way to run
the graph against a scripted model. No network, no API key."""

from __future__ import annotations

from typing import Any

import pytest

from agent.graph import Agent, Deps
from agent.llm import ScriptedModel, Turn
from agent.services import (
    AuditLog,
    CaseRecord,
    DocumentRecord,
    Ledger,
    MemoryCaseStore,
    PolicyStore,
    ProgramCatalogue,
    Services,
    StubRulesClient,
)
from agent.tools import build_registry


def check(rule_id: str, verdict: str, status: str, detail: str) -> dict[str, Any]:
    return {"rule_id": rule_id, "label": f"label {rule_id}", "verdict": verdict, "status": status, "detail": detail}


RULES_BLOCKED = {
    "can_proceed": False,
    "ruleset_version": "block-v1",
    "checks": [
        check("R1", "warn", "ok", "transcript spelling differs from the passport in a way seen in Thai romanisation"),
        check("R2", "pass", "ok", "matches on every document"),
        check("R3", "warn", "pending", "both documents not yet received"),
        check("R4", "pass", "ok", "covers the course with buffer"),
        check("R5", "block", "failed", "expires 2026-08-26, before the target submission date 2026-10-31"),
    ],
    "checked_at_ms": 0,
}

RULES_CLEAR = {
    "can_proceed": True,
    "ruleset_version": "block-v1",
    "checks": [check(r, "pass", "ok", "matches on every document") for r in ("R1", "R2", "R3", "R4", "R5")],
    "checked_at_ms": 0,
}


def confirmed(doc_type: str, fields: dict[str, Any]) -> dict[str, Any]:
    return {"doc_type": doc_type, "date_source_calendar": "AD", "fields": fields, "confirmed_at": "2026-09-11T00:00:00Z"}


def seeded_case(*, suspicious: str | None = None, injected_field: str | None = None) -> CaseRecord:
    transcript_fields = {
        "name_latin_as_printed": "TANAWAT JAROENSUK",
        "date_of_birth": "2003-01-31",
        "institution_name": injected_field or "Bangkok Christian College",
        "date_graduated": "2026-02-28",
    }
    return CaseRecord(
        case_id="STU-2026-0413",
        country="AU",
        course_end_date="2029-06-30",
        submission_target="2026-10-31",
        documents=[
            DocumentRecord("doc-pp", "passport", "synth-0000.passport.png",
                           confirmed("passport", {"given_name_latin": "THANAWAT", "surname_latin": "JAROENSUK",
                                                  "date_of_birth": "2003-01-31", "passport_expiry": "2032-06-06"})),
            DocumentRecord("doc-tr", "transcript", "synth-0000.transcript.png",
                           confirmed("transcript", transcript_fields), suspicious_content=suspicious),
            DocumentRecord("doc-en", "english_test", "synth-0000.english_test.png",
                           confirmed("english_test", {"name_latin_as_printed": "THANAWAT JAROENSUK",
                                                      "date_of_birth": "2003-01-31", "test_date": "2024-08-26"})),
            DocumentRecord("doc-ce", "degree_certificate", "cert.png", None),
        ],
    )


def ready_case() -> CaseRecord:
    """Every document confirmed and consistent: the case the programme
    conversation is built for."""
    name = {"name_latin_as_printed": "THANAWAT JAROENSUK", "date_of_birth": "2003-01-31"}
    return CaseRecord(
        case_id="STU-2026-0413",
        country="AU",
        course_end_date="2029-06-30",
        submission_target="2026-10-31",
        documents=[
            DocumentRecord("doc-pp", "passport", "p.png",
                           confirmed("passport", {"given_name_latin": "THANAWAT", "surname_latin": "JAROENSUK",
                                                  "date_of_birth": "2003-01-31", "passport_expiry": "2032-06-06"})),
            DocumentRecord("doc-tr", "transcript", "t.png",
                           confirmed("transcript", {**name, "institution_name": "Kasetsart University",
                                                    "qualification": "Bachelor of Business Administration",
                                                    "major": "Business Administration", "gpa": 3.1, "gpa_scale": 4.0,
                                                    "date_graduated": "2026-02-28"})),
            DocumentRecord("doc-ce", "degree_certificate", "c.png",
                           confirmed("degree_certificate", {"name_latin_as_printed": "THANAWAT JAROENSUK",
                                                            "qualification": "Bachelor of Business Administration",
                                                            "institution_name": "Kasetsart University",
                                                            "field_of_study": "Business Administration",
                                                            "date_conferred": "2026-05-15"})),
            DocumentRecord("doc-en", "english_test", "e.png",
                           confirmed("english_test", {**name, "test_type": "IELTS", "test_date": "2026-01-10",
                                                      "overall": 6.5, "listening": 6.5, "reading": 6.5,
                                                      "writing": 6.0, "speaking": 6.5})),
        ],
    )


def make_services(rules: dict[str, Any] = RULES_BLOCKED, case: CaseRecord | None = None) -> Services:
    return Services(
        cases=MemoryCaseStore([case or seeded_case()]),
        rules=StubRulesClient(rules),
        policies=PolicyStore.load_default(),
        programs=ProgramCatalogue.load_default(),
        ledger=Ledger(),
        audit=AuditLog(emit=False),
    )


def make_agent(script: list[Turn], services: Services | None = None, max_iterations: int = 6):
    svc = services or make_services()
    model = ScriptedModel(script)
    agent = Agent(Deps(model=model, registry=build_registry(svc), services=svc, max_iterations=max_iterations))
    return agent, svc, model


@pytest.fixture
def services() -> Services:
    return make_services()
