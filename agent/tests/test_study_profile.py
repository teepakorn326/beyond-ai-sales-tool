"""The study profile is PII-free by construction and derives the next study
level deterministically."""

import json

from agent.services import _gpa_on_4, annotate_fit, build_study_profile, suggested_levels

from .conftest import ready_case, seeded_case


def test_secondary_suggests_bachelor_then_diploma():
    assert suggested_levels("Mathayom 6") == ["bachelor", "diploma"]
    assert suggested_levels("ม.6") == ["bachelor", "diploma"]
    assert suggested_levels("High School Certificate") == ["bachelor", "diploma"]


def test_bachelor_suggests_master_and_master_or_unknown_nothing():
    assert suggested_levels("Bachelor of Business Administration") == ["master"]
    assert suggested_levels("B.Sc.") == ["master"]
    assert suggested_levels("ปริญญาตรี") == ["master"]
    assert suggested_levels("Master of Science") == []
    assert suggested_levels(None) == []
    assert suggested_levels("Certificate of Attendance") == []


def test_profile_prefers_the_certificate_and_carries_the_english_band():
    p = build_study_profile(ready_case())
    assert p["qualification"] == "Bachelor of Business Administration"
    assert p["field"] == "Business Administration"
    assert p["gpa_on_4"] == 3.1
    assert p["english"] == {"test_type": "IELTS", "overall": 6.5, "lowest_band": 6.0, "test_date": "2026-01-10"}
    assert p["suggested_levels"] == ["master"]
    assert p["sources"] == {"transcript": True, "degree_certificate": True, "english_test": True}


def test_profile_contains_no_pii():
    blob = json.dumps(build_study_profile(ready_case()))
    for leak in ("THANAWAT", "JAROENSUK", "2003-01-31", "name_latin", "date_of_birth", "report_number"):
        assert leak not in blob, leak


def test_unconfirmed_documents_contribute_nothing():
    p = build_study_profile(seeded_case())  # certificate uploaded but unconfirmed
    assert p["sources"]["degree_certificate"] is False
    assert p["field"] is None and p["qualification"] is None


def test_gpa_is_normalised_to_a_four_point_scale():
    assert _gpa_on_4(78, 100) == 3.12
    assert _gpa_on_4(3.1, 4.0) == 3.1
    assert _gpa_on_4(None, 4.0) is None


def test_annotate_fit_marks_english_shortfall_and_missing_gpa():
    profile = build_study_profile(ready_case())  # 6.5 overall, lowest 6.0, GPA 3.1
    fits = annotate_fit(
        [
            {"id": "A", "english_overall_min": 7.0, "english_band_min": 6.5, "min_gpa": 3.0},
            {"id": "B", "english_overall_min": 6.5, "english_band_min": 6.0, "min_gpa": None},
            {"id": "C", "english_overall_min": 6.0, "english_band_min": 5.5, "min_gpa": 3.5},
        ],
        profile,
    )
    assert [f["fit"] for f in fits] == [
        {"english": "short", "gpa": "ok"},
        {"english": "ok", "gpa": "not_required"},
        {"english": "ok", "gpa": "short"},
    ]
    assert annotate_fit([{"id": "A", "english_overall_min": 6.0, "english_band_min": 5.5, "min_gpa": 2.0}], None)[0]["fit"] == {"english": "unknown", "gpa": "unknown"}
