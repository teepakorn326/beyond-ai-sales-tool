"""search_policy filters by effective date before it matches anything."""

import pytest

from agent.services import PolicyStore


@pytest.fixture
def store() -> PolicyStore:
    return PolicyStore.load_default()


def test_march_case_gets_the_version_in_force_in_march(store):
    hits = store.search("ielts หมดอายุ", "AU", "2026-03-15")
    assert [p.id for p in hits] == ["AU-ENG-2025.1"]


def test_august_case_gets_the_later_version(store):
    hits = store.search("ielts หมดอายุ", "AU", "2026-08-15")
    assert [p.id for p in hits] == ["AU-ENG-2026.2"]


def test_boundary_day_belongs_to_the_new_version(store):
    assert [p.id for p in store.search("ielts", "AU", "2026-07-01")] == ["AU-ENG-2026.2"]
    assert [p.id for p in store.search("ielts", "AU", "2026-06-30")] == ["AU-ENG-2025.1"]


def test_country_filter_applies(store):
    assert all(p.country == "NZ" for p in store.search("passport", "NZ", "2026-03-01"))


def test_nothing_matches_before_a_policy_exists(store):
    assert store.search("ielts", "AU", "2024-06-01") == []


def test_bad_effective_date_fails_loudly(store):
    with pytest.raises(ValueError):
        store.search("ielts", "AU", "latest")
