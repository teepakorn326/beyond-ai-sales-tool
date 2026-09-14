"""Deterministic guardrail. Runs before anything else and needs no model.

A classifier that is right 97% of the time is the wrong tool for a rule whose
threshold is 30/30: the 3% would be an unlicensed migration opinion given to a
student. Pattern rules are crude, but they are inspectable, testable, and
they fail in the safe direction (over-escalate to a person).
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass

_TH_Q = r"(?:ไหม|มั้ย|มั๊ย|หรือเปล่า|รึเปล่า|หรือไม่|ป่าว|ปะ)"

# fmt: off
_CATEGORIES: list[tuple[str, list[str]]] = [
    ("approval_odds", [
        r"โอกาส.{0,25}(?:ผ่าน|อนุมัติ|ได้วีซ่า|ติด|สำเร็จ)",
        r"(?:%|เปอร์เซ็นต์|เปอร์เซนต์).{0,20}(?:ผ่าน|อนุมัติ|ได้วีซ่า|สำเร็จ)",
        r"(?:ผ่าน|อนุมัติ|ได้วีซ่า|สำเร็จ).{0,20}(?:%|เปอร์เซ็นต์|เปอร์เซนต์)",
        r"(?:จะ)?(?:ผ่าน|ได้วีซ่า|ได้รับอนุมัติ|อนุมัติ|ติด)\s*(?:แน่|ชัวร์)?\s*" + _TH_Q,
        r"(?:ประเมิน|คาดการณ์|เดา|ทาย|ฟันธง).{0,20}(?:โอกาส|ผล|ผ่าน|อนุมัติ)",
        r"\b(?:chance|chances|odds|likelihood|probability|success rate|approval rate)\b",
        r"\bhow likely\b",
        r"\bwill (?:it|this|the (?:visa|application|case)|they|he|she) (?:be |get )?(?:approved|pass|granted|refused|rejected)\b",
        r"\b(?:predict|estimate|guess)\b.{0,30}\b(?:approval|outcome|refusal|grant)\b",
    ]),
    ("write_statement", [
        # a statement noun AND a writing verb; checking one is allowed
        (
            r"(?=.*(?:\bGS\b|genuine student|\bSOP\b|statement of purpose|personal statement"
            r"|จดหมายแนะนำตัว|จดหมายชี้แจง|จดหมายแสดงเจตนา|เรียงความ|GS statement))"
            r"(?=.*(?:เขียน|ร่าง|แต่ง|แก้|ปรับ|เรียบเรียง|เกลา|ช่วยทำ|ทำให้ดีขึ้น"
            r"|\bwrite\b|\bdraft\b|\bedit\b|\brewrite\b|\bimprove\b|\bpolish\b|\bcompose\b"
            r"|\brevise\b|\bfix\b|\bproofread\b|\bredo\b))"
        ),
    ]),
    ("migration_advice", [
        r"\bPR\b",
        r"permanent residen",
        r"ถิ่นที่อยู่ถาวร", r"อยู่ถาวร", r"ย้ายถิ่น", r"พีอาร์",
        r"\bmigrat",
        # "pathway" and "settle" only in a visa/residency sense: "course pathway"
        # and "settle on a programme" are ordinary sales questions.
        r"\bpathway\b(?=.{0,40}(?:visa|residen|\bPR\b|migrat|work))",
        r"\bsettl(?:e|ing) (?:in|permanently|down)\b",
        r"เส้นทาง.{0,15}(?:PR|ถาวร|อยู่ต่อ|ทำงาน|ย้าย)",
        r"(?:อยู่ต่อ|ทำงานต่อ).{0,20}(?:หลังเรียน|หลังจบ|เรียนจบ)",
        r"(?:หลังเรียนจบ|หลังจบ|เรียนจบแล้ว).{0,20}(?:อยู่ต่อ|ทำงาน|ขอวีซ่า|ต่อวีซ่า)",
        r"\bskilled (?:migration|visa|independent)\b",
        r"subclass\s*(?:189|190|491|485|482|186|820|801|300)\b",
        r"(?:ควร|แนะนำ|เลือก|ดีกว่า|เหมาะ).{0,25}(?:subclass|ซับคลาส|วีซ่าประเภท|วีซ่าแบบ)",
        r"(?:subclass|ซับคลาส|วีซ่าประเภท|วีซ่าแบบ).{0,20}(?:ไหน|อะไร|ดี|เหมาะ)",
        r"\bwhich (?:visa|subclass|pathway)\b",
        r"\b(?:work|partner|spouse|bridging|graduate|post-?study) visa\b",
        r"วีซ่า(?:ทำงาน|คู่สมรส|ติดตาม|ถาวร|หลังเรียนจบ)",
    ]),
    ("authenticity", [
        r"ปลอม", r"ของแท้", r"ของจริง", r"แท้หรือ", r"แท้" + _TH_Q,
        r"จริง\s*" + _TH_Q,
        r"ตรวจสอบความ(?:แท้|จริง|ถูกต้องของตรา)",
        r"\b(?:fake|forged|forgery|counterfeit|doctored|tampered|photoshop|fabricated)\b",
        r"\b(?:real|authentic|genuine|legit|legitimate)\b.{0,40}\b(?:document|transcript|passport|certificate|ielts|report|stamp|seal)\b",
        r"\b(?:document|transcript|passport|certificate|ielts|report|stamp|seal)\b.{0,40}\b(?:real|authentic|genuine|legit|legitimate)\b",
    ]),
    ("injected_instruction", [
        r"ignore (?:all |the |any )?(?:previous|prior|above|earlier) (?:instructions|rules|guidance)",
        r"disregard.{0,30}(?:instructions|rules|guardrails)",
        r"\bsystem prompt\b",
        r"\byou are now\b",
        r"\bnew instructions?:",
        r"(?:ไม่ต้องสนใจ|ละเว้น|ข้าม|ลืม).{0,15}(?:คำสั่ง|กฎ|ข้อกำหนด).{0,15}(?:ก่อนหน้า|ทั้งหมด|เดิม)",
        # A statement, not a question: "does the student meet all requirements
        # for this course?" is something a sales user legitimately asks.
        (
            r"(?<!does )(?<!do )(?<!whether )(?<!if )(?<!does the )(?<!do the )(?<!does this )(?<!whether the )(?<!if the )"
            r"(?:applicant|student|case|application).{0,30}meets? all (?:the )?requirements"
        ),
        r"\bapprove (?:this|the) (?:case|application|student)\b",
        r"\bmark(?:ed)? (?:this |the |it )?(?:as )?(?:approved|complete|verified)\b",
        r"ผ่านทุกเกณฑ์", r"ครบทุกเกณฑ์แล้ว", r"อนุมัติได้เลย", r"ถือว่า(?:ผ่าน|ครบ|อนุมัติ)",
    ]),
]
# fmt: on

_COMPILED = [
    (cat, [re.compile(p, re.IGNORECASE | re.DOTALL) for p in pats]) for cat, pats in _CATEGORIES
]

# "Genuine Student" is the name of a requirement, not a claim about a
# document's authenticity. Neutralise it before the authenticity patterns.
_GS_NAME = re.compile(r"genuine\s+student", re.IGNORECASE)

# "the statement the student wrote" is not a request to write one. Strip the
# student-as-author phrasing before looking for a writing verb.
_STUDENT_WROTE = re.compile(
    r"(?:ที่)?(?:นักเรียน|น้อง|เด็ก|ผู้สมัคร)\s*(?:เขียน|ร่าง)(?:มา|เอง|ไว้)?"
    r"|(?:เขียน|ร่าง)(?:มา|เอง|ไว้)(?:แล้ว)?"
    r"|(?:student|applicant)s?\s+(?:wrote|drafted|has written|had written)"
    r"|written by",
    re.IGNORECASE,
)


def _haystack(category: str, text: str) -> str:
    if category == "authenticity":
        return _GS_NAME.sub("GS-requirement", text)
    if category == "write_statement":
        return _STUDENT_WROTE.sub(" ", text)
    return text


@dataclass(frozen=True)
class GuardrailVerdict:
    blocked: bool
    category: str | None = None
    matched: str | None = None

    def as_dict(self) -> dict:
        return asdict(self)


def check_question(text: str) -> GuardrailVerdict:
    for category, patterns in _COMPILED:
        haystack = _haystack(category, text)
        for pat in patterns:
            m = pat.search(haystack)
            if m:
                return GuardrailVerdict(True, category, m.group(0)[:80])
    return GuardrailVerdict(False)


_DIRECTIVES = dict(_COMPILED)["injected_instruction"]


def find_directive(text: str | None) -> str | None:
    """Instruction-like text inside document content. Returns the match so it
    can be shown to the reviewer; it is never acted on."""
    if not text:
        return None
    for pat in _DIRECTIVES:
        m = pat.search(text)
        if m:
            return m.group(0)[:80]
    return None


def scan_fields(fields: dict | None) -> str | None:
    if not fields:
        return None
    for v in fields.values():
        if isinstance(v, str) and (hit := find_directive(v)):
            return hit
    return None


# What the sales user sees when the guardrail fires. It says where the
# question went; it does not answer it.
ESCALATION_ANSWER: dict[str, str] = {
    "approval_odds": (
        "This question asks for the likelihood of a visa being granted. The system does not "
        "give a number or probability for that. It has been passed to the visa team; the system "
        "can only say whether the documents are complete and consistent."
    ),
    "write_statement": (
        "The system does not write, draft or edit a Genuine Student statement or SOP. The request "
        "has been passed to the visa team. To have a statement the student wrote checked against "
        "the five criteria, ask again."
    ),
    "migration_advice": (
        "This question asks for migration or visa-subclass advice, which requires a licence. It has "
        "been passed to the visa team; the system only answers on document completeness and "
        "consistency."
    ),
    "authenticity": (
        "The system does not judge whether a document is genuine or forged. The question has been "
        "passed to the visa team to check."
    ),
    "injected_instruction": (
        "The question contains text that reads like an instruction to skip the process. The system "
        "did not follow it and has passed the question to the visa team."
    ),
}
