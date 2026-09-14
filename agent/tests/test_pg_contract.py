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
