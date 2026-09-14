"""Extraction accuracy against the synthetic corpus.

Skips when there is no prediction file: `python -m evals.run` produces one by
calling the API, and CI restores it from cache so that a pull request does not
have to spend money to be checked.
"""

import json
from pathlib import Path

import pytest
import yaml

from evals.scoring import report, score

HERE = Path(__file__).parent
DATA = HERE / "datasets"
PREDS = HERE / "predictions.json"

pytestmark = pytest.mark.skipif(
    not PREDS.exists(), reason="no predictions.json — run `python -m evals.run` first"
)


def load(doc_type: str) -> tuple[dict, dict, dict]:
    manifest = json.loads((DATA / "manifest.json").read_text())
    truths = {
        rid: json.loads((DATA / f"{rid}.truth.json").read_text())[doc_type]
        for rid in manifest
    }
    preds = json.loads(PREDS.read_text()).get(doc_type, {})
    thresholds = yaml.safe_load((HERE / "thresholds.yaml").read_text())[doc_type]
    return truths, preds, thresholds


@pytest.mark.parametrize("doc_type", ["transcript", "passport", "english_test"])
def test_field_accuracy_meets_thresholds(doc_type):
    truths, preds, thresholds = load(doc_type)
    if not preds:
        pytest.skip(f"no predictions for {doc_type}")

    scores = score(truths, preds, list(thresholds))
    failures = report(scores, thresholds)

    print(f"\n{doc_type}")
    for name, s in sorted(scores.items()):
        print(f"  {name:26} {s.accuracy:.3f}  ({s.correct}/{s.total})")

    assert not failures, "\n".join(failures)


def test_buddhist_era_years_are_converted():
    """A BE year that survives extraction still parses as a valid date, so it
    never raises — it just quietly makes the student 543 years old."""
    truths, preds, _ = load("transcript")
    if not preds:
        pytest.skip("no predictions")

    wrong = [
        rid
        for rid, t in truths.items()
        if (p := preds.get(rid))
        and p.get("date_graduated")
        and int(p["date_graduated"][:4]) > 2100
    ]
    assert not wrong, f"unconverted Buddhist-era years in: {wrong[:5]}"
