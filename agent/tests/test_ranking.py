"""Hybrid ranking: keyword-first exactly as before, cosine only as a tie-break
or a fallback. These are the rules that keep test_policy.py's pinned ids."""

from agent.ranking import Candidate, hybrid_score, keyword_score, rank


def ids(ranked):
    return [r.id for r in ranked]


def test_keyword_score_counts_thai_and_english_substrings():
    assert keyword_score("ielts หมดอายุ แล้ว", ["ielts", "หมดอายุ", "passport"]) == 2
    assert keyword_score("IELTS", ["ielts"]) == 1


def test_best_keyword_group_wins_regardless_of_cosine():
    cands = [Candidate("A", 2, 0.10), Candidate("B", 1, 0.99), Candidate("C", 0, 0.99)]
    assert ids(rank(cands, limit=3)) == ["A"]


def test_cosine_breaks_ties_inside_the_best_group():
    cands = [Candidate("A", 1, 0.20), Candidate("B", 1, 0.90)]
    assert ids(rank(cands, limit=3)) == ["B", "A"]


def test_no_keyword_hit_falls_back_to_cosine_above_the_floor():
    cands = [Candidate("A", 0, 0.85), Candidate("B", 0, 0.20), Candidate("C", 0, None)]
    assert ids(rank(cands, limit=3)) == ["A"]


def test_nothing_relevant_returns_empty():
    assert rank([Candidate("A", 0, 0.10), Candidate("B", 0, None)], limit=3) == []
    assert rank([], limit=3) == []


def test_without_embeddings_it_is_keyword_only_and_deterministic():
    cands = [Candidate("Z", 1, None), Candidate("A", 1, None), Candidate("M", 0, None)]
    assert ids(rank(cands, limit=3)) == ["A", "Z"]
    assert hybrid_score(1, None) == 1.0
    assert ids(rank(cands, limit=1)) == ["A"]
