"""Ranking for policy search, shared by the list-backed and Postgres stores.

Keyword-first: the rule the file store has always applied (only the policies
tied at the best keyword score are returned) is kept exactly, so the pinned
ids in tests/test_policy.py do not move. Cosine similarity from the embedding
index only breaks ties inside that best group, and only takes over when no
keyword matches at all — that is what makes a paraphrased question still
find the right policy. Pure functions, no I/O.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

MIN_COSINE = 0.30


@dataclass(frozen=True)
class Candidate:
    id: str
    keyword: int
    cosine: float | None


@dataclass(frozen=True)
class Ranked:
    id: str
    keyword: int
    cosine: float | None
    score: float


def keyword_score(query: str, keywords: Iterable[str]) -> int:
    """How many of the policy's keywords occur in the question. Substring
    match on the lowercased question, which is how the Thai keywords work."""
    q = query.lower()
    return sum(1 for k in keywords if k.lower() in q)


def hybrid_score(keyword: int, cosine: float | None) -> float:
    # A keyword difference always outranks any cosine difference (cosine < 1).
    return keyword + (cosine or 0.0)


def rank(cands: list[Candidate], *, limit: int, min_cosine: float = MIN_COSINE) -> list[Ranked]:
    best = max((c.keyword for c in cands), default=0)
    if best > 0:
        pool = [c for c in cands if c.keyword == best]
    else:
        pool = [c for c in cands if c.cosine is not None and c.cosine >= min_cosine]
    ranked = [Ranked(c.id, c.keyword, c.cosine, hybrid_score(c.keyword, c.cosine)) for c in pool]
    ranked.sort(key=lambda r: (-r.score, r.id))
    return ranked[:limit]
