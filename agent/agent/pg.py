"""Postgres-backed stores, selected when DATABASE_URL is set (see wiring.py).

Reads the tables the web tier writes (cases, documents) and the policy and
programme indexes seeded by `python -m agent.seed`. Embeddings come from the
extractor's /embed route, so this package never holds a model credential.
No anthropic or langchain import lives here; tests never import this module.
"""

from __future__ import annotations

import json
import os
from datetime import date
from typing import Any, Protocol

import httpx

from .ranking import Candidate, keyword_score, rank
from .services import CaseRecord, DocumentRecord, MemoryCaseStore, Policy


class Embedder(Protocol):
    def embed(self, texts: list[str], input_type: str = "document") -> list[list[float]]: ...


class ExtractorEmbedder:
    def __init__(self, base_url: str, timeout: float = 20.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def embed(self, texts: list[str], input_type: str = "document") -> list[list[float]]:
        r = httpx.post(
            f"{self.base_url}/embed", json={"texts": texts, "input_type": input_type}, timeout=self.timeout
        )
        r.raise_for_status()
        return r.json()["embeddings"]


class PgConnections:
    """A small psycopg pool. Lazy so importing this module costs nothing."""

    def __init__(self, dsn: str):
        self.dsn = dsn
        self._pool: Any = None

    def pool(self):
        if self._pool is None:
            from pgvector.psycopg import register_vector
            from psycopg_pool import ConnectionPool

            self._pool = ConnectionPool(self.dsn, min_size=1, max_size=4, configure=register_vector, open=True)
        return self._pool

    def connection(self):
        return self.pool().connection()


def _vec(v: list[float] | None) -> str | None:
    return None if v is None else "[" + ",".join(f"{x:.8g}" for x in v) + "]"


# ---------------------------------------------------------------------------
# Policies
# ---------------------------------------------------------------------------


class PostgresPolicyStore:
    def __init__(self, conns: PgConnections, embedder: Embedder | None):
        self.conns = conns
        self.embedder = embedder

    def _query_vector(self, query: str) -> list[float] | None:
        if self.embedder is None:
            return None
        try:
            return self.embedder.embed([query], "query")[0]
        except Exception:  # noqa: BLE001 - keyword search must keep working without embeddings
            return None

    def search(self, query: str, country: str, effective_date: str, limit: int = 3) -> list[Policy]:
        """Same contract as PolicyStore.search: the date filter runs before any
        matching, a bad date fails loudly, and there is no "latest" mode."""
        date.fromisoformat(effective_date)  # ValueError before any I/O
        qvec = _vec(self._query_vector(query))
        sql = """
            SELECT id, country, topic, title, version, effective_from, effective_to, keywords, text, synthetic,
                   CASE WHEN %(q)s::vector IS NULL OR embedding IS NULL THEN NULL
                        ELSE 1 - (embedding <=> %(q)s::vector) END AS cosine
            FROM policies
            WHERE country = %(country)s
              AND effective_from <= %(day)s::date
              AND (effective_to IS NULL OR %(day)s::date < effective_to)
        """
        with self.conns.connection() as conn:
            rows = conn.execute(sql, {"q": qvec, "country": country, "day": effective_date}).fetchall()

        policies: dict[str, Policy] = {}
        cands: list[Candidate] = []
        for r in rows:
            (pid, ctry, topic, title, version, eff_from, eff_to, keywords, text, synthetic, cosine) = r
            policies[pid] = Policy(
                id=pid,
                country=ctry,
                topic=topic,
                title=title,
                version=version,
                effective_from=eff_from.isoformat(),
                effective_to=eff_to.isoformat() if eff_to else None,
                keywords=tuple(keywords or ()),
                text=text,
                synthetic=bool(synthetic),
            )
            cands.append(Candidate(pid, keyword_score(query, keywords or ()), float(cosine) if cosine is not None else None))
        return [policies[r.id] for r in rank(cands, limit=limit)]


# ---------------------------------------------------------------------------
# Programmes
# ---------------------------------------------------------------------------


class PostgresProgramCatalogue:
    COLS = (
        "id, institution, country, level, field, intakes, duration_months, english_overall_min, "
        "english_band_min, synthetic, city, tuition_aud_per_year, min_gpa, entry_requirement, description"
    )

    def __init__(self, conns: PgConnections, embedder: Embedder | None):
        self.conns = conns
        self.embedder = embedder

    @staticmethod
    def build_query(filters: dict[str, Any], qvec: str | None) -> tuple[str, dict[str, Any]]:
        """Same filters as ProgramCatalogue.search, in SQL. Pure, so it is
        testable without a database."""
        where: list[str] = ["true"]
        params: dict[str, Any] = {}
        if filters.get("country"):
            where.append("upper(country) = upper(%(country)s)")
            params["country"] = filters["country"]
        lv = filters.get("level")
        if lv:
            params["levels"] = [str(x).lower() for x in (lv if isinstance(lv, (list, tuple)) else [lv])]
            where.append("lower(level) = ANY(%(levels)s)")
        if filters.get("field"):
            where.append("field ILIKE %(field)s")
            params["field"] = f"%{filters['field']}%"
        if filters.get("city"):
            where.append("city ILIKE %(city)s")
            params["city"] = f"%{filters['city']}%"
        if (mx := filters.get("max_english_overall")) is not None:
            where.append("english_overall_min <= %(mx)s")
            params["mx"] = mx
        if (mt := filters.get("max_tuition_aud")) is not None:
            where.append("tuition_aud_per_year IS NOT NULL AND tuition_aud_per_year <= %(max_tuition)s")
            params["max_tuition"] = mt
        if (g := filters.get("gpa")) is not None:
            where.append("(min_gpa IS NULL OR min_gpa <= %(gpa)s)")
            params["gpa"] = g
        order = "id"
        if qvec is not None:
            params["q"] = qvec
            order = "embedding <=> %(q)s::vector NULLS LAST, id"
        sql = f"SELECT {PostgresProgramCatalogue.COLS} FROM programs WHERE {' AND '.join(where)} ORDER BY {order} LIMIT 20"
        return sql, params

    def search(self, filters: dict[str, Any]) -> list[dict[str, Any]]:
        qvec = None
        if filters.get("query") and self.embedder is not None:
            try:
                qvec = _vec(self.embedder.embed([str(filters["query"])], "query")[0])
            except Exception:  # noqa: BLE001 - filter search must keep working without embeddings
                qvec = None
        sql, params = self.build_query(filters, qvec)
        with self.conns.connection() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [
            {
                "id": r[0],
                "institution": r[1],
                "country": r[2],
                "level": r[3],
                "field": r[4],
                "intakes": list(r[5] or []),
                "duration_months": int(r[6]),
                "english_overall_min": float(r[7]),
                "english_band_min": float(r[8]),
                "synthetic": bool(r[9]),
                "city": r[10] or "",
                "tuition_aud_per_year": int(r[11]) if r[11] is not None else None,
                "min_gpa": float(r[12]) if r[12] is not None else None,
                "entry_requirement": r[13] or "",
                "description": r[14] or "",
            }
            for r in rows
        ]


# ---------------------------------------------------------------------------
# Cases and documents (what the web tier wrote)
# ---------------------------------------------------------------------------


class PostgresCaseStore:
    """Same view of the world as FileCaseStore, read from the tables. Only
    confirmed_json, the suspicious-content flag and requests leave the
    documents table; extracted field values never do."""

    def __init__(self, conns: PgConnections):
        self.conns = conns

    def _load(self) -> MemoryCaseStore:
        with self.conns.connection() as conn:
            metas = conn.execute(
                "SELECT case_id, country, course_end_date, submission_target, program_id, status FROM cases"
            ).fetchall()
            docs = conn.execute(
                """SELECT id, case_id, doc_type, filename, confirmed_json,
                          extracted_json->>'suspicious_content', requests
                   FROM documents WHERE superseded_by IS NULL ORDER BY created_at"""
            ).fetchall()
        by_case: dict[str, list[DocumentRecord]] = {}
        for d in docs:
            by_case.setdefault(d[1], []).append(
                DocumentRecord(
                    doc_id=str(d[0]),
                    doc_type=d[2],
                    filename=d[3],
                    confirmed_json=d[4] if isinstance(d[4], dict) or d[4] is None else json.loads(d[4]),
                    suspicious_content=d[5],
                    requests=list(d[6] or []),
                )
            )
        meta = {m[0]: m for m in metas}
        cases = []
        for case_id in set(meta) | set(by_case):
            m = meta.get(case_id)
            cases.append(
                CaseRecord(
                    case_id=case_id,
                    country=m[1] if m else "AU",
                    course_end_date=m[2].isoformat() if m and m[2] else None,
                    submission_target=m[3].isoformat() if m and m[3] else None,
                    program_id=m[4] if m else None,
                    status=m[5] if m else "open",
                    documents=by_case.get(case_id, []),
                )
            )
        return MemoryCaseStore(cases)

    def get_case(self, case_ref: str) -> CaseRecord | None:
        return self._load().get_case(case_ref)

    def get_document(self, doc_id: str) -> DocumentRecord | None:
        return self._load().get_document(doc_id)


def connections_from_env() -> PgConnections | None:
    dsn = os.getenv("DATABASE_URL", "")
    return PgConnections(dsn) if dsn else None
