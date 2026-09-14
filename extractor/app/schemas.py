"""One schema definition, used in three places.

The same Pydantic models describe the shape we ask the model for, validate what
comes back, and serialise the API response. When the model returns something
off-spec it fails here, at the boundary, instead of leaking a bad value four
layers deep into the case file.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

Confidence = Literal["high", "medium", "low"]
DocType = Literal["passport", "transcript", "degree_certificate", "english_test"]


class ExtractionMeta(BaseModel):
    doc_type: DocType
    field_confidence: dict[str, Confidence] = Field(default_factory=dict)
    field_source_page: dict[str, int] = Field(default_factory=dict)
    fields_unreadable: list[str] = Field(default_factory=list)
    low_precision_dates: list[str] = Field(default_factory=list)
    date_source_calendar: Literal["BE", "AD"] | None = None
    # Anything in the document that reads like an instruction rather than data.
    # Recorded, never obeyed.
    suspicious_content: str | None = None


class Passport(ExtractionMeta):
    doc_type: Literal["passport"] = "passport"
    given_name_latin: str | None = None
    surname_latin: str | None = None
    name_th: str | None = None
    date_of_birth: date | None = None
    nationality: str | None = None
    passport_expiry: date | None = None
    issuing_country: str | None = None
    # We record that a number is present, never the number itself.
    passport_number_present: bool = False


class Transcript(ExtractionMeta):
    doc_type: Literal["transcript"] = "transcript"
    name_latin_as_printed: str | None = None
    name_th: str | None = None
    date_of_birth: date | None = None
    institution_name: str | None = None
    qualification: str | None = None
    gpa: float | None = Field(None, ge=0, le=100)
    gpa_scale: float | None = Field(None, ge=0, le=100)
    date_enrolled: date | None = None
    date_graduated: date | None = None
    medium_of_instruction: str | None = None
    major: str | None = None


class DegreeCertificate(ExtractionMeta):
    doc_type: Literal["degree_certificate"] = "degree_certificate"
    name_latin_as_printed: str | None = None
    qualification: str | None = None
    institution_name: str | None = None
    date_conferred: date | None = None
    field_of_study: str | None = None


class EnglishTest(ExtractionMeta):
    doc_type: Literal["english_test"] = "english_test"
    test_type: Literal["IELTS", "PTE", "TOEFL"] | None = None
    name_latin_as_printed: str | None = None
    date_of_birth: date | None = None
    test_date: date | None = None
    overall: float | None = Field(None, ge=0, le=120)
    listening: float | None = Field(None, ge=0, le=120)
    reading: float | None = Field(None, ge=0, le=120)
    writing: float | None = Field(None, ge=0, le=120)
    speaking: float | None = Field(None, ge=0, le=120)
    report_number_present: bool = False
    # expires_at is deliberately absent: date arithmetic belongs to the rules
    # engine, not to a language model.


SCHEMA_FOR: dict[str, type[ExtractionMeta]] = {
    "passport": Passport,
    "transcript": Transcript,
    "degree_certificate": DegreeCertificate,
    "english_test": EnglishTest,
}
