"""The scorer is the thing every other number depends on, so it gets tests too."""

from evals.scoring import FieldScore, norm, report, score


def test_norm_collapses_whitespace_and_case():
    assert norm("  suwanna   jaroensuk ") == "SUWANNA JAROENSUK"


def test_norm_rounds_floats_to_two_places():
    assert norm(2.8700000001) == 2.87


def test_score_counts_per_field():
    truths = {
        "a": {"gpa": 2.87, "dob": "2004-03-14"},
        "b": {"gpa": 3.10, "dob": "2005-01-01"},
    }
    preds = {
        "a": {"gpa": 2.87, "dob": "2004-03-14"},
        "b": {"gpa": 3.11, "dob": "2005-01-01"},
    }
    s = score(truths, preds, ["gpa", "dob"])
    assert s["gpa"].accuracy == 0.5
    assert s["dob"].accuracy == 1.0


def test_missing_prediction_is_not_counted_as_correct():
    s = score({"a": {"gpa": 2.0}}, {}, ["gpa"])
    assert s["gpa"].total == 0


def test_report_flags_only_fields_below_floor():
    scores = {
        "gpa": FieldScore(total=10, correct=9),
        "dob": FieldScore(total=10, correct=10),
    }
    failures = report(scores, {"gpa": 0.95, "dob": 0.99})
    assert len(failures) == 1
    assert failures[0].startswith("gpa")
