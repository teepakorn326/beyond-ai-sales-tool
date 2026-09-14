"""Field-level scoring.

Deliberately not a single accuracy number. One aggregate figure hides the thing
that matters: which field is wrong. A run that reads every GPA correctly and
every date of birth incorrectly should not look the same as its opposite.
"""

from dataclasses import dataclass, field


def norm(v: object) -> object:
    if isinstance(v, str):
        return " ".join(v.split()).upper()
    if isinstance(v, float):
        return round(v, 2)
    return v


@dataclass
class FieldScore:
    total: int = 0
    correct: int = 0
    misses: list[tuple[str, object, object]] = field(default_factory=list)

    @property
    def accuracy(self) -> float:
        return self.correct / self.total if self.total else 0.0


def score(
    truths: dict[str, dict],
    preds: dict[str, dict],
    fields: list[str],
) -> dict[str, FieldScore]:
    out = {f: FieldScore() for f in fields}
    for rid, truth in truths.items():
        pred = preds.get(rid)
        if pred is None:
            continue
        for f in fields:
            s = out[f]
            s.total += 1
            want, got = norm(truth.get(f)), norm(pred.get(f))
            if want == got:
                s.correct += 1
            else:
                s.misses.append((rid, want, got))
    return out


def report(scores: dict[str, FieldScore], thresholds: dict[str, float]) -> list[str]:
    """Return a list of human-readable failures. Empty means the run passed."""
    failures = []
    for name, s in scores.items():
        floor = thresholds.get(name)
        if floor is None or s.total == 0:
            continue
        if s.accuracy < floor:
            sample = s.misses[:3]
            detail = "; ".join(f"{rid}: want {w!r} got {g!r}" for rid, w, g in sample)
            failures.append(
                f"{name}: {s.accuracy:.3f} < {floor:.3f} "
                f"({s.correct}/{s.total}) — {detail}"
            )
    return failures
