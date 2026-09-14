"""The programme catalogue: fictional, complete, and filterable the way the
model and the deterministic gather step use it."""

from agent.services import ProgramCatalogue


def cat() -> ProgramCatalogue:
    return ProgramCatalogue.load_default()


def test_catalogue_has_twenty_five_fictional_programmes():
    ps = cat().programs
    assert len(ps) == 25
    assert len({p.id for p in ps}) == 25
    assert all(p.institution.endswith("(fictional)") and p.synthetic for p in ps)
    assert all(p.city and p.entry_requirement and p.description for p in ps)


def test_country_and_level_are_case_insensitive():
    a = cat().search({"country": "au", "level": "Master"})
    b = cat().search({"country": "AU", "level": "master"})
    assert a == b and a


def test_level_accepts_a_list():
    hits = cat().search({"country": "AU", "level": ["bachelor", "diploma"]})
    assert hits and {h["level"] for h in hits} == {"bachelor", "diploma"}


def test_city_substring_and_tuition_ceiling():
    assert all(h["city"] == "Melbourne" for h in cat().search({"city": "melb"}))
    cheap = cat().search({"max_tuition_aud": 20000})
    assert cheap and all(h["tuition_aud_per_year"] <= 20000 for h in cheap)


def test_gpa_filter_keeps_programmes_without_a_floor():
    hits = cat().search({"gpa": 2.0})
    assert all(h["min_gpa"] is None or h["min_gpa"] <= 2.0 for h in hits)
    assert any(h["min_gpa"] is None for h in hits)


def test_unknown_query_is_ignored_in_the_file_store():
    assert len(cat().search({"query": "anything at all"})) == 25
