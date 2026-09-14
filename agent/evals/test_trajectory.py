"""Trajectory suite against the scripted model. Enforces evals/thresholds.yaml."""

from .run import load_fixtures, load_thresholds, run_trajectory, trajectory_report


def test_there_are_thirty_trajectory_cases():
    fixtures = load_fixtures("trajectory")
    assert len(fixtures) == 30
    assert len({f["id"] for f in fixtures}) == 30


def test_trajectory_meets_thresholds():
    rows = run_trajectory()
    _agg, lines = trajectory_report(rows, load_thresholds()["trajectory"])
    print("\n" + "\n".join(lines))
    failures = [ln for ln in lines if ln.startswith("trajectory.")]
    assert not failures, "\n".join(failures)
