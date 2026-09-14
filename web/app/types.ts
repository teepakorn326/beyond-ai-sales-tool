// Mirrors the Go structs in rules/ and the Pydantic models in
// extractor/app/schemas.py. Kept hand-written rather than generated so that a
// change on either side shows up as a type error in review.

// ---------------------------------------------------------------------------
// rules/rules.go
// ---------------------------------------------------------------------------

export type Verdict = "pass" | "warn" | "block";
export type CheckStatus = "ok" | "failed" | "pending";

export interface Check {
  rule_id: string;
  label: string;
  verdict: Verdict;
  status: CheckStatus;
  detail: string;
}

export interface CheckResult {
  case_id: string;
  can_proceed: boolean;
  ruleset_version: string;
  checks: Check[];
  checked_at_ms: number;
}

/** rules.Case. Dates are ISO strings; null where Go has a nil pointer. */
export interface Case {
  case_id: string;
  passport_name: string;
  passport_dob: string | null;
  passport_expiry: string | null;
  transcript_name: string;
  transcript_dob: string | null;
  transcript_grad_date: string | null;
  certificate_grad_date: string | null;
  english_test_name: string | null;
  english_test_dob: string | null;
  english_test_date: string | null;
  course_end_date: string | null;
  submission_target: string | null;
}

/** A pending check is not a passing check. Anything unresolved blocks. */
export function openCount(r: CheckResult): number {
  return r.checks.filter(
    (c) => c.verdict === "block" || c.status === "pending" || c.verdict === "warn",
  ).length;
}

// ---------------------------------------------------------------------------
// extractor/app/schemas.py
// ---------------------------------------------------------------------------

export type Confidence = "high" | "medium" | "low";
export type DocType = "passport" | "transcript" | "degree_certificate" | "english_test";
export type SourceCalendar = "BE" | "AD";

export const DOC_TYPES: readonly DocType[] = [
  "passport",
  "transcript",
  "degree_certificate",
  "english_test",
];

export interface ExtractionMeta {
  doc_type: DocType;
  field_confidence: Record<string, Confidence>;
  field_source_page: Record<string, number>;
  fields_unreadable: string[];
  low_precision_dates: string[];
  date_source_calendar: SourceCalendar | null;
  /** Text in the document that reads like an instruction. Recorded, never obeyed. */
  suspicious_content: string | null;
}

export interface Passport extends ExtractionMeta {
  doc_type: "passport";
  given_name_latin: string | null;
  surname_latin: string | null;
  name_th: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  passport_expiry: string | null;
  issuing_country: string | null;
  /** Existence only. The number itself is never stored. */
  passport_number_present: boolean;
}

export interface Transcript extends ExtractionMeta {
  doc_type: "transcript";
  name_latin_as_printed: string | null;
  name_th: string | null;
  date_of_birth: string | null;
  institution_name: string | null;
  qualification: string | null;
  gpa: number | null;
  gpa_scale: number | null;
  date_enrolled: string | null;
  date_graduated: string | null;
  medium_of_instruction: string | null;
  major: string | null;
}

export interface DegreeCertificate extends ExtractionMeta {
  doc_type: "degree_certificate";
  name_latin_as_printed: string | null;
  qualification: string | null;
  institution_name: string | null;
  date_conferred: string | null;
  field_of_study: string | null;
}

export interface EnglishTest extends ExtractionMeta {
  doc_type: "english_test";
  test_type: "IELTS" | "PTE" | "TOEFL" | null;
  name_latin_as_printed: string | null;
  date_of_birth: string | null;
  test_date: string | null;
  overall: number | null;
  listening: number | null;
  reading: number | null;
  writing: number | null;
  speaking: number | null;
  report_number_present: boolean;
  // expires_at is deliberately absent, as in the Python schema.
}

export type Extraction = Passport | Transcript | DegreeCertificate | EnglishTest;

export type FieldValue = string | number | boolean | null;

/** Value-carrying keys of a document: everything that is not review metadata. */
export type ValueKey<T extends ExtractionMeta> = Exclude<keyof T, keyof ExtractionMeta>;

// Field order as shown to the reviewer. The type-level checks below fail to
// compile if a schema field is added to an interface without being listed.
export const PASSPORT_FIELDS = [
  "given_name_latin",
  "surname_latin",
  "name_th",
  "date_of_birth",
  "nationality",
  "passport_expiry",
  "issuing_country",
  "passport_number_present",
] as const satisfies readonly ValueKey<Passport>[];

export const TRANSCRIPT_FIELDS = [
  "name_latin_as_printed",
  "name_th",
  "date_of_birth",
  "institution_name",
  "qualification",
  "gpa",
  "gpa_scale",
  "date_enrolled",
  "date_graduated",
  "medium_of_instruction",
  "major",
] as const satisfies readonly ValueKey<Transcript>[];

export const DEGREE_CERTIFICATE_FIELDS = [
  "name_latin_as_printed",
  "qualification",
  "institution_name",
  "date_conferred",
  "field_of_study",
] as const satisfies readonly ValueKey<DegreeCertificate>[];

export const ENGLISH_TEST_FIELDS = [
  "test_type",
  "name_latin_as_printed",
  "date_of_birth",
  "test_date",
  "overall",
  "listening",
  "reading",
  "writing",
  "speaking",
  "report_number_present",
] as const satisfies readonly ValueKey<EnglishTest>[];

type AssertNever<T extends never> = T;
type Missing<T extends ExtractionMeta, L extends readonly string[]> = Exclude<
  ValueKey<T>,
  L[number]
>;
type _PassportComplete = AssertNever<Missing<Passport, typeof PASSPORT_FIELDS>>;
type _TranscriptComplete = AssertNever<Missing<Transcript, typeof TRANSCRIPT_FIELDS>>;
type _CertificateComplete = AssertNever<
  Missing<DegreeCertificate, typeof DEGREE_CERTIFICATE_FIELDS>
>;
type _EnglishTestComplete = AssertNever<Missing<EnglishTest, typeof ENGLISH_TEST_FIELDS>>;

export const FIELDS_FOR: { readonly [K in DocType]: readonly string[] } = {
  passport: PASSPORT_FIELDS,
  transcript: TRANSCRIPT_FIELDS,
  degree_certificate: DEGREE_CERTIFICATE_FIELDS,
  english_test: ENGLISH_TEST_FIELDS,
};

export type FieldKind = "text" | "number" | "boolean" | "date";

const DATE_FIELDS: ReadonlySet<string> = new Set([
  "date_of_birth",
  "passport_expiry",
  "date_enrolled",
  "date_graduated",
  "date_conferred",
  "test_date",
]);
const NUMBER_FIELDS: ReadonlySet<string> = new Set([
  "gpa",
  "gpa_scale",
  "overall",
  "listening",
  "reading",
  "writing",
  "speaking",
]);

export function fieldKind(name: string): FieldKind {
  if (DATE_FIELDS.has(name)) return "date";
  if (NUMBER_FIELDS.has(name)) return "number";
  if (name.endsWith("_present")) return "boolean";
  return "text";
}

/** extractor/app/schemas.py Classification: what one page is. No values. */
export type ClassifiedType = DocType | "other";

export interface Classification {
  doc_type: ClassifiedType;
  confidence: Confidence;
  reason: string;
  is_continuation: boolean;
}

// ---------------------------------------------------------------------------
// Review records (web tier only)
// ---------------------------------------------------------------------------

export interface UploadPage {
  filename: string;
  content_type: string;
  classification: Classification;
}

/** One group of pages the sorter decided belong together. Held until a
 *  person assigns a type when the sorter could not, or was not sure. */
export interface UploadRecord {
  id: string;
  case_id: string;
  created_at: string;
  pages: UploadPage[];
  suggested_type: ClassifiedType;
  status: "held" | "extracted";
  held_reason: string | null;
  document_id: string | null;
}

export type RequestKind = "new_photo" | "new_document";

/** An ask recorded for the student. Nothing is sent from here; a person relays it. */
export interface DocumentRequest {
  kind: RequestKind;
  field: string | null;
  created_at: string;
}

/** The only shape downstream is allowed to read. */
export interface ConfirmedExtraction {
  doc_type: DocType;
  date_source_calendar: SourceCalendar | null;
  fields: Record<string, FieldValue>;
  confirmed_at: string;
}

export interface ReviewDocument {
  id: string;
  case_id: string;
  doc_type: DocType;
  filename: string;
  content_type: string;
  created_at: string;
  /** Pages live on the upload when the document came through the sorter. */
  upload_id: string | null;
  page_count: number;
  /** How the type was decided, if by the classifier. Null when a person chose it. */
  classification: Classification | null;
  /** Set when a reviewer re-sorted this document under another type. */
  superseded_by: string | null;
  /** Model output exactly as it arrived. Written once, never edited. */
  readonly extracted_json: Readonly<Extraction>;
  /** Values a person has confirmed so far, by field name. */
  confirmations: Record<string, FieldValue>;
  requests: DocumentRequest[];
  /** Set only when every required field is confirmed. Null until then. */
  confirmed_json: ConfirmedExtraction | null;
}
