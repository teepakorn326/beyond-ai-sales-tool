"""Programme questions are detected deterministically; lodgement questions
and the web's suggestion chips are not."""

import pytest

from agent.intent import is_programme_question, programme_filters

PROGRAMME = [
    "เคส 0413 หลักสูตรไหนเหมาะกับน้องคนนี้",
    "มหาวิทยาลัยไหนเหมาะกับน้อง",
    "Case 0413: Which programmes fit this student?",
    "เคส 0413 น้องอยากเรียนต่อโท ค่าเทอมเท่าไหร่",
    "Case 0413: which course in Melbourne accepts IELTS 6.0?",
    "เคส 0413 สาขาไหนรับ GPA 2.8",
    "เคส 0413 ถ้า IELTS ได้ 6.0 มีหลักสูตรไหนในออสเตรเลียรับบ้าง",
]
NOT_PROGRAMME = [
    "เคส 0413 ทำไมยังยื่นไม่ได้",
    "Why is this case blocked?",
    "Which documents still need review?",
    "Does the student's name match?",
    "What needs to happen before submission?",
    "พาสปอร์ตเคส 0413 หมดอายุเมื่อไหร่",
    "ผลสอบ IELTS ใช้ยื่นออสเตรเลียได้กี่ปี",
    "which visa should the student apply for",
    "ควรยื่น subclass ไหนดี",
]


@pytest.mark.parametrize("q", PROGRAMME)
def test_programme_questions_are_detected(q):
    assert is_programme_question(q), q


@pytest.mark.parametrize("q", NOT_PROGRAMME)
def test_case_questions_are_not(q):
    assert not is_programme_question(q), q


def test_filters_use_case_country_profile_levels_and_field():
    f = programme_filters({"country": "AU"}, {"suggested_levels": ["master"], "field": "Business Administration"}, "which fit?")
    assert f == {"country": "AU", "level": ["master"], "query": "Business Administration which fit?"}


def test_a_named_subject_in_the_question_is_not_drowned_by_the_student_field():
    f = programme_filters({"country": "AU"}, {"suggested_levels": ["master"], "field": "Business Administration"}, "master of civil engineer")
    assert f["query"] == "master of civil engineer"
    f = programme_filters({"country": "AU"}, {"suggested_levels": ["master"], "field": "Business Administration"}, "เรียนต่อวิศวะได้ไหม")
    assert f["query"] == "เรียนต่อวิศวะได้ไหม"


def test_filters_without_profile_have_no_level():
    assert programme_filters({"country": "NZ"}, None, "q") == {"country": "NZ", "query": "q"}
