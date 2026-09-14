"""Backends the tools talk to. Each has a protocol so tests and evals can run
against in-memory versions without a network or a model."""

from __future__ import annotations

import json
import logging
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Protocol

import httpx

from .ranking import Candidate, keyword_score, rank

DATA_DIR = Path(__file__).parent / "data"

# ---------------------------------------------------------------------------
# Audit log: shapes and counts, never content
# ---------------------------------------------------------------------------

_logger = logging.getLogger("agent")
_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(logging.Formatter("%(message)s"))
_logger.addHandler(_handler)
_logger.setLevel(logging.INFO)


class AuditLog:
    """Every non-read tool call and every answer lands here. Kept in memory
    for inspection and emitted as one JSON line each, in the same style as
    the extractor's logging."""

    def __init__(self, emit: bool = True):
        self.entries: list[dict[str, Any]] = []
        self._emit = emit

    def record(self, **fields: Any) -> None:
        entry = {"ts": time.time(), **fields}
        self.entries.append(entry)
        if self._emit:
            _logger.info(json.dumps(entry, ensure_ascii=False, default=str))


# ---------------------------------------------------------------------------
# Cases and documents
# ---------------------------------------------------------------------------


@dataclass
class DocumentRecord:
    doc_id: str
    doc_type: str
    filename: str
    confirmed_json: dict[str, Any] | None
    # Review metadata only. No extracted field values ever leave the web tier
    # unconfirmed; this flag is the one thing the agent needs from the
    # unconfirmed side, and it carries no field value.
    suspicious_content: str | None = None
    requests: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class CaseRecord:
    case_id: str
    country: str  # "AU" | "NZ"
    course_end_date: str | None
    submission_target: str | None
    program_id: str | None = None
    status: str = "open"
    documents: list[DocumentRecord] = field(default_factory=list)


class CaseStore(Protocol):
    def get_case(self, case_ref: str) -> CaseRecord | None: ...
    def get_document(self, doc_id: str) -> DocumentRecord | None: ...


class MemoryCaseStore:
    def __init__(self, cases: list[CaseRecord]):
        self._cases = {c.case_id: c for c in cases}

    def get_case(self, case_ref: str) -> CaseRecord | None:
        if case_ref in self._cases:
            return self._cases[case_ref]
        # "เคส 0413" refers to STU-2026-0413; a suffix match is how staff talk.
        hits = [c for cid, c in self._cases.items() if cid.endswith(case_ref)]
        return hits[0] if len(hits) == 1 else None

    def get_document(self, doc_id: str) -> DocumentRecord | None:
        for c in self._cases.values():
            for d in c.documents:
                if d.doc_id == doc_id:
                    return d
        return None


class FileCaseStore:
    """Reads the web tier's document store plus a cases.json holding what the
    review UI does not store: country and the two case dates."""

    def __init__(self, web_data_dir: str | Path, cases_file: str | Path | None = None):
        self.docs_dir = Path(web_data_dir) / "documents"
        self.cases_file = Path(cases_file) if cases_file else Path(web_data_dir) / "cases.json"

    def _load(self) -> MemoryCaseStore:
        meta: dict[str, dict[str, Any]] = {}
        if self.cases_file.exists():
            meta = json.loads(self.cases_file.read_text(encoding="utf-8"))
        by_case: dict[str, list[DocumentRecord]] = {}
        if self.docs_dir.exists():
            for p in sorted(self.docs_dir.glob("*.json")):
                raw = json.loads(p.read_text(encoding="utf-8"))
                if raw.get("superseded_by"):
                    continue  # re-sorted under another type; the newer record counts
                by_case.setdefault(raw["case_id"], []).append(
                    DocumentRecord(
                        doc_id=raw["id"],
                        doc_type=raw["doc_type"],
                        filename=raw["filename"],
                        confirmed_json=raw.get("confirmed_json"),
                        suspicious_content=raw["extracted_json"].get("suspicious_content"),
                        requests=raw.get("requests", []),
                    )
                )
        cases = []
        for case_id in set(meta) | set(by_case):
            m = meta.get(case_id, {})
            cases.append(
                CaseRecord(
                    case_id=case_id,
                    country=m.get("country", "AU"),
                    course_end_date=m.get("course_end_date"),
                    submission_target=m.get("submission_target"),
                    program_id=m.get("program_id"),
                    status=m.get("status", "open"),
                    documents=by_case.get(case_id, []),
                )
            )
        return MemoryCaseStore(cases)

    def get_case(self, case_ref: str) -> CaseRecord | None:
        return self._load().get_case(case_ref)

    def get_document(self, doc_id: str) -> DocumentRecord | None:
        return self._load().get_document(doc_id)


def _field(doc: DocumentRecord | None, name: str) -> str | None:
    if doc is None or doc.confirmed_json is None:
        return None
    v = doc.confirmed_json.get("fields", {}).get(name)
    return v if isinstance(v, str) and v != "" else None


def build_rules_payload(case: CaseRecord) -> dict[str, Any]:
    """rules.Case from confirmed documents only. Mirrors web/app/lib/review.ts
    buildCase; an unconfirmed document contributes nothing."""

    def latest(doc_type: str) -> DocumentRecord | None:
        hits = [d for d in case.documents if d.doc_type == doc_type and d.confirmed_json]
        return hits[-1] if hits else None

    p, t, c, e = (latest(k) for k in ("passport", "transcript", "degree_certificate", "english_test"))
    name = " ".join(s for s in (_field(p, "given_name_latin"), _field(p, "surname_latin")) if s)
    return {
        "case_id": case.case_id,
        "passport_name": name,
        "passport_dob": _field(p, "date_of_birth"),
        "passport_expiry": _field(p, "passport_expiry"),
        "transcript_name": _field(t, "name_latin_as_printed") or "",
        "transcript_dob": _field(t, "date_of_birth"),
        "transcript_grad_date": _field(t, "date_graduated"),
        "certificate_grad_date": _field(c, "date_conferred"),
        "english_test_name": _field(e, "name_latin_as_printed"),
        "english_test_dob": _field(e, "date_of_birth"),
        "english_test_date": _field(e, "test_date"),
        "course_end_date": case.course_end_date,
        "submission_target": case.submission_target,
    }


# ---------------------------------------------------------------------------
# Rules engine
# ---------------------------------------------------------------------------


class RulesClient(Protocol):
    def check(self, payload: dict[str, Any]) -> dict[str, Any]: ...


class HttpRulesClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def check(self, payload: dict[str, Any]) -> dict[str, Any]:
        r = httpx.post(f"{self.base_url}/check", json=payload, timeout=10)
        r.raise_for_status()
        return r.json()


class StubRulesClient:
    def __init__(self, result: dict[str, Any]):
        self.result = result
        self.payloads: list[dict[str, Any]] = []

    def check(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.payloads.append(payload)
        return {**self.result, "case_id": payload["case_id"]}


# ---------------------------------------------------------------------------
# Policy search: filter by effective date first, then match
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Policy:
    id: str
    country: str
    topic: str
    title: str
    version: str
    effective_from: str
    effective_to: str | None
    keywords: tuple[str, ...]
    text: str
    synthetic: bool = True

    def citation(self) -> dict[str, Any]:
        return {
            "policy_id": self.id,
            "title": self.title,
            "version": self.version,
            "effective_from": self.effective_from,
            "effective_to": self.effective_to,
            "country": self.country,
        }

    def in_force_on(self, day: str) -> bool:
        d = date.fromisoformat(day)
        if d < date.fromisoformat(self.effective_from):
            return False
        return self.effective_to is None or d < date.fromisoformat(self.effective_to)


class PolicyIndex(Protocol):
    def search(self, query: str, country: str, effective_date: str, limit: int = 3) -> list[Policy]: ...


class PolicyStore:
    def __init__(self, policies: list[Policy]):
        self.policies = policies

    @classmethod
    def load_default(cls) -> PolicyStore:
        raw = json.loads((DATA_DIR / "policies.json").read_text(encoding="utf-8"))
        return cls([Policy(**{**p, "keywords": tuple(p["keywords"])}) for p in raw])

    def search(self, query: str, country: str, effective_date: str, limit: int = 3) -> list[Policy]:
        """The date filter runs before any matching. There is no way to ask
        this store for "the latest version": a case lodged in March is
        governed by the rules in force in March, and the caller must say
        which day it means."""
        date.fromisoformat(effective_date)  # raises on a bad date, loudly
        in_force = [
            p for p in self.policies if p.country == country and p.in_force_on(effective_date)
        ]
        # Keyword-only here (no embeddings in the file store): only the
        # best-matching topic is returned. "IELTS expired" shares the word
        # "expired" with the passport policy; citing both would be noise.
        by_id = {p.id: p for p in in_force}
        cands = [Candidate(p.id, keyword_score(query, p.keywords), None) for p in in_force]
        return [by_id[r.id] for r in rank(cands, limit=limit)]


# ---------------------------------------------------------------------------
# Program catalogue (synthetic institutions)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Program:
    id: str
    institution: str
    country: str
    level: str
    field: str
    intakes: tuple[str, ...]
    duration_months: int
    english_overall_min: float
    english_band_min: float
    synthetic: bool = True


class ProgramIndex(Protocol):
    def search(self, filters: dict[str, Any]) -> list[dict[str, Any]]: ...


class ProgramCatalogue:
    def __init__(self, programs: list[Program]):
        self.programs = programs

    @classmethod
    def load_default(cls) -> ProgramCatalogue:
        raw = json.loads((DATA_DIR / "programs.json").read_text(encoding="utf-8"))
        return cls([Program(**{**p, "intakes": tuple(p["intakes"])}) for p in raw])

    def search(self, filters: dict[str, Any]) -> list[dict[str, Any]]:
        out = []
        for p in self.programs:
            if filters.get("country") and p.country != filters["country"]:
                continue
            if filters.get("level") and p.level != filters["level"]:
                continue
            if filters.get("field") and filters["field"].lower() not in p.field.lower():
                continue
            if (mx := filters.get("max_english_overall")) is not None and p.english_overall_min > mx:
                continue
            out.append(asdict(p))
        return out


# ---------------------------------------------------------------------------
# Internal ledger: what reversible and approved actions wrote
# ---------------------------------------------------------------------------


class Ledger:
    """Where the write tools land. Nothing here leaves the building: a
    request or a draft is a record for a person to act on, not a send."""

    def __init__(self):
        self.escalations: list[dict[str, Any]] = []
        self.flags: list[dict[str, Any]] = []
        self.requests: list[dict[str, Any]] = []
        self.drafts: list[dict[str, Any]] = []
        self.answers: list[dict[str, Any]] = []

    @staticmethod
    def _stamp(**fields: Any) -> dict[str, Any]:
        return {"ts": time.time(), **fields}

    def escalate(self, case_id: str, reason: str) -> dict[str, Any]:
        e = self._stamp(case_id=case_id, reason=reason, status="queued")
        self.escalations.append(e)
        return e

    def flag(self, doc_id: str, reason: str) -> dict[str, Any]:
        f = self._stamp(doc_id=doc_id, reason=reason)
        self.flags.append(f)
        return f

    def request_document(self, case_id: str, doc_type: str, reason: str) -> dict[str, Any]:
        r = self._stamp(case_id=case_id, doc_type=doc_type, reason=reason, status="to_send")
        self.requests.append(r)
        return r

    def draft(self, case_id: str, message_th: str) -> dict[str, Any]:
        d = self._stamp(case_id=case_id, message_th=message_th, status="draft")
        self.drafts.append(d)
        return d


@dataclass
class Services:
    cases: CaseStore
    rules: RulesClient
    policies: PolicyIndex
    programs: ProgramIndex
    ledger: Ledger
    audit: AuditLog
