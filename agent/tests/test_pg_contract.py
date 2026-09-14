"""The Postgres policy store keeps PolicyStore's contract: a bad effective
date fails before any connection is used. Needs no database; psycopg is not
imported unless a query runs."""

import pytest

pytest.importorskip("httpx")

from agent.pg import PostgresPolicyStore


class ExplodingConnections:
    def connection(self):
        raise AssertionError("a connection was opened before the date was validated")


def test_bad_effective_date_fails_before_any_io():
    store = PostgresPolicyStore(ExplodingConnections(), embedder=None)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        store.search("ielts", "AU", "latest")


def test_program_query_keeps_null_gpa_floors_and_lowercases_levels():
    from agent.pg import PostgresProgramCatalogue

    sql, params = PostgresProgramCatalogue.build_query({"country": "au", "level": ["Master"], "gpa": 2.8}, None)
    assert "min_gpa IS NULL OR min_gpa <= %(gpa)s" in sql
    assert params["levels"] == ["master"] and params["gpa"] == 2.8
    sql2, params2 = PostgresProgramCatalogue.build_query({}, None)
    assert "%(gpa)s" not in sql2 and "ORDER BY id" in sql2 and params2 == {}
