"""Deterministic question-kind detection. Runs after the guardrail, so a
question that reaches here has already been cleared of visa/PR/odds asks."""

from __future__ import annotations

import re
from typing import Any

_TH = (
    r"(?:มหาวิทยาลัย|มหาลัย|หลักสูตร|คอร์ส|สาขา|เรียนต่อ|ค่าเทอม|ค่าเรียน|สมัครเรียน"
    r"|เปิดเทอม|รับสมัคร|วิทยาลัย|ปริญญา(?:ตรี|โท)|ป\.(?:ตรี|โท)|ต่อโท|ต่อตรี)"
)
_EN = (
    r"\b(?:universit(?:y|ies)|programmes?|programs?|courses?|degrees?|diplomas?"
    r"|bachelor'?s?|masters?|tuition|fees?|intakes?|campus|institutions?|colleges?"
    r"|study options?|which (?:programme|program|course|degree|university)"
    r"|what (?:can|could) (?:the student|she|he|they) study|study in)\b"
)
# Belt and braces: the guardrail already escalates these, but intent must
# never be the thing that turns "which visa" into a catalogue search.
_NOT = r"\b(?:which|what) (?:visa|subclass)\b|วีซ่า(?:ประเภท|แบบ)|subclass"

PROGRAMME = re.compile(_TH + "|" + _EN, re.IGNORECASE)
NOT_PROGRAMME = re.compile(_NOT, re.IGNORECASE)


def is_programme_question(question: str) -> bool:
    return bool(PROGRAMME.search(question)) and not NOT_PROGRAMME.search(question)


def programme_filters(case: dict[str, Any], profile: dict[str, Any] | None, question: str) -> dict[str, Any]:
    """Filters for the one deterministic search_programs call: country from
    the case, level(s) from the profile, and the question itself as the free
    text so a subject the user names ("civil engineering", "in Melbourne")
    ranks first. The student's own field is added only when the question
    names no subject, so it never drowns out what was asked. No English or
    GPA filter here: shortfalls are annotated, not hidden."""
    f: dict[str, Any] = {"country": case["country"]}
    if profile and profile.get("suggested_levels"):
        f["level"] = list(profile["suggested_levels"])
    field = (profile or {}).get("field")
    query = question.strip()
    if field and not _names_subject(question):
        query = f"{field} {query}"
    if query:
        f["query"] = query
    return f


_SUBJECT = re.compile(
    r"\b(?:engineer|engineering|nursing|business|accounting|marketing|finance|computer|computing|data|cyber|science|"
    r"hospitality|tourism|education|teaching|law|design|health|management|it|arts?|commerce|economics|psychology)\b"
    r"|วิศว|พยาบาล|บริหาร|บัญชี|การตลาด|คอมพิวเตอร์|ไอที|ท่องเที่ยว|โรงแรม|ครู|ศึกษาศาสตร์|กฎหมาย|ออกแบบ",
    re.IGNORECASE,
)


def _names_subject(question: str) -> bool:
    return bool(_SUBJECT.search(question))
