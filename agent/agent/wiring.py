"""Builds the Services the graph runs against. Postgres when DATABASE_URL is
set, the file store otherwise. The Postgres modules are imported lazily so
the test suite never needs psycopg."""

from __future__ import annotations

from .config import settings
from .services import (
    AuditLog,
    FileCaseStore,
    HttpRulesClient,
    Ledger,
    PolicyStore,
    ProgramCatalogue,
    Services,
)


def backend_name() -> str:
    return "postgres" if settings.database_url else "files"


def build_services(*, audit_emit: bool = True, data_dir: str | None = None) -> Services:
    rules = HttpRulesClient(settings.rules_url)
    if settings.database_url:
        from .pg import (
            ExtractorEmbedder,
            PgConnections,
            PostgresCaseStore,
            PostgresPolicyStore,
            PostgresProgramCatalogue,
        )

        conns = PgConnections(settings.database_url)
        embedder = ExtractorEmbedder(settings.extractor_url) if settings.extractor_url else None
        return Services(
            cases=PostgresCaseStore(conns),
            rules=rules,
            policies=PostgresPolicyStore(conns, embedder),
            programs=PostgresProgramCatalogue(conns, embedder),
            ledger=Ledger(),
            audit=AuditLog(emit=audit_emit),
        )
    return Services(
        cases=FileCaseStore(data_dir or settings.web_data_dir),
        rules=rules,
        policies=PolicyStore.load_default(),
        programs=ProgramCatalogue.load_default(),
        ledger=Ledger(),
        audit=AuditLog(emit=audit_emit),
    )
