// Pure review logic shared by the server routes and the client screen. No I/O
// here, so every branch is testable by calling a function.

import {
  FIELDS_FOR,
  fieldKind,
  type Case,
  type Confidence,
  type ConfirmedExtraction,
  type DocType,
  type Extraction,
  type FieldKind,
  type FieldValue,
  type ReviewDocument,
  type SourceCalendar,
} from "../types";

export class ReviewError extends Error {}

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  passport: "Passport",
  transcript: "Transcript",
  degree_certificate: "Degree certificate",
  english_test: "English test",
};

export const LABELS: Record<string, string> = {
  given_name_latin: "Given name (Latin)",
  surname_latin: "Surname (Latin)",
  name_th: "Name (Thai)",
  name_latin_as_printed: "Name as printed (Latin)",
  date_of_birth: "Date of birth",
  nationality: "Nationality",
  passport_expiry: "Passport expiry",
  issuing_country: "Issuing country",
  passport_number_present: "Passport number present",
  institution_name: "Institution",
  qualification: "Qualification",
  gpa: "Cumulative GPA",
  gpa_scale: "GPA scale",
  date_enrolled: "Date enrolled",
  date_graduated: "Date graduated",
  medium_of_instruction: "Medium of instruction",
  major: "Major",
  date_conferred: "Date conferred",
  field_of_study: "Field of study",
  test_type: "Test type",
  test_date: "Test date",
  overall: "Overall",
  listening: "Listening",
  reading: "Reading",
  writing: "Writing",
  speaking: "Speaking",
  report_number_present: "Report number present",
};

/** Fields where a "correction" could quietly become a reconciliation. */
export const NAME_FIELDS: ReadonlySet<string> = new Set([
  "given_name_latin",
  "surname_latin",
  "name_latin_as_printed",
]);

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function fieldValue(x: Readonly<Extraction>, name: string): FieldValue {
  const v: unknown = (x as unknown as Readonly<Record<string, unknown>>)[name];
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return null;
}

export type FieldStatus = "confirmed" | "unreadable" | "absent" | Confidence;

export interface FieldView {
  name: string;
  label: string;
  kind: FieldKind;
  /** The extracted value. Null when absent or unreadable. */
  value: FieldValue;
  confidence: Confidence | null;
  status: FieldStatus;
  lowPrecision: boolean;
  page: number | null;
  /** undefined until a person confirms it. */
  confirmedValue: FieldValue | undefined;
}

export function fieldViews(doc: ReviewDocument): FieldView[] {
  const x = doc.extracted_json;
  return FIELDS_FOR[doc.doc_type].map((name) => {
    const value = fieldValue(x, name);
    const unreadable = x.fields_unreadable.includes(name);
    const confidence: Confidence | null = x.field_confidence[name] ?? null;
    const confirmedValue = name in doc.confirmations ? doc.confirmations[name] : undefined;

    let status: FieldStatus;
    if (confirmedValue !== undefined) status = "confirmed";
    else if (unreadable) status = "unreadable";
    else if (value === null) status = "absent";
    // A value the model did not rate must not slip into the batch. Treat it
    // as low so a person looks at it individually.
    else status = confidence ?? "low";

    return {
      name,
      label: LABELS[name] ?? name,
      kind: fieldKind(name),
      value,
      confidence,
      status,
      lowPrecision: x.low_precision_dates.includes(name),
      page: x.field_source_page[name] ?? null,
      confirmedValue,
    };
  });
}

/** Everything a person has to sign off before the document counts as confirmed. */
export function requiredFields(x: Readonly<Extraction>): string[] {
  return FIELDS_FOR[x.doc_type].filter(
    (name) => fieldValue(x, name) !== null || x.fields_unreadable.includes(name),
  );
}

export interface FieldConfirmation {
  name: string;
  value: FieldValue;
}

/** Returns an error message, or null when the value fits the field. */
export function validateValue(name: string, value: FieldValue): string | null {
  switch (fieldKind(name)) {
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "Must be a number";
    case "boolean":
      return typeof value === "boolean" ? null : "Must be yes or no";
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? null
        : "Must be a date in YYYY-MM-DD (Gregorian)";
    case "text":
      return typeof value === "string" && value.trim() !== "" ? null : "Must not be empty";
  }
}

/** Turns what a reviewer typed into the field's typed value. */
export function parseInput(
  name: string,
  raw: string,
): { ok: true; value: FieldValue } | { ok: false; error: string } {
  const trimmed = raw.trim();
  let value: FieldValue;
  switch (fieldKind(name)) {
    case "number":
      value = trimmed === "" ? null : Number(trimmed);
      break;
    case "boolean":
      value = trimmed === "true";
      break;
    default:
      value = trimmed;
  }
  const error = validateValue(name, value);
  return error ? { ok: false, error } : { ok: true, value };
}

/**
 * The confirm step. Pure: returns a new record and carries `extracted_json`
 * over by reference, untouched. `confirmed_json` appears only once every
 * required field has been confirmed, so a half-reviewed document can never be
 * mistaken for a reviewed one downstream.
 */
export function applyConfirmations(
  doc: ReviewDocument,
  fields: readonly FieldConfirmation[],
  now: string,
): ReviewDocument {
  const allowed = FIELDS_FOR[doc.doc_type];
  const confirmations: Record<string, FieldValue> = { ...doc.confirmations };
  for (const f of fields) {
    if (!allowed.includes(f.name)) {
      throw new ReviewError(`No field ${f.name} on a ${doc.doc_type}`);
    }
    const error = validateValue(f.name, f.value);
    if (error) throw new ReviewError(`${LABELS[f.name] ?? f.name}: ${error}`);
    confirmations[f.name] = f.value;
  }

  const required = requiredFields(doc.extracted_json);
  const complete = required.every((name) => name in confirmations);
  const confirmed_json: ConfirmedExtraction | null = complete
    ? {
        doc_type: doc.doc_type,
        date_source_calendar: doc.extracted_json.date_source_calendar,
        fields: Object.fromEntries(allowed.map((name) => [name, confirmations[name] ?? null])),
        confirmed_at: now,
      }
    : null;

  return { ...doc, confirmations, confirmed_json };
}

// ---------------------------------------------------------------------------
// Dates as the document printed them
// ---------------------------------------------------------------------------

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/**
 * Reconstructs what was printed on the page from the stored ISO value: the
 * Buddhist-era year if the document used it, and no day if the document gave
 * none. The reviewer compares this against the image, not against the
 * system's conversion.
 */
export function asPrinted(
  iso: string,
  calendar: SourceCalendar | null,
  lowPrecision: boolean,
): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const year = calendar === "BE" ? `${p.y + 543} BE` : String(p.y);
  const month = MONTHS[p.m - 1] ?? String(p.m);
  return lowPrecision ? `${month} ${year}` : `${p.d} ${month} ${year}`;
}

// ---------------------------------------------------------------------------
// From confirmed documents to a rules-engine case
// ---------------------------------------------------------------------------

function latestConfirmed(docs: readonly ReviewDocument[], t: DocType): ConfirmedExtraction | null {
  const hits = docs
    .filter((d) => d.doc_type === t && d.confirmed_json !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return hits[0]?.confirmed_json ?? null;
}

function str(c: ConfirmedExtraction | null, name: string): string | null {
  const v = c?.fields[name];
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * Builds the rules-engine payload from confirmed documents only. Reads
 * `confirmed_json`, never `extracted_json`: an unreviewed extraction must not
 * reach the rules engine even by accident.
 */
export function buildCase(
  docs: readonly ReviewDocument[],
  caseId: string,
  courseEnd: string | null,
  submissionTarget: string | null,
): Case {
  const p = latestConfirmed(docs, "passport");
  const t = latestConfirmed(docs, "transcript");
  const c = latestConfirmed(docs, "degree_certificate");
  const e = latestConfirmed(docs, "english_test");

  const passportName = [str(p, "given_name_latin"), str(p, "surname_latin")]
    .filter((s): s is string => s !== null)
    .join(" ");

  return {
    case_id: caseId,
    passport_name: passportName,
    passport_dob: str(p, "date_of_birth"),
    passport_expiry: str(p, "passport_expiry"),
    transcript_name: str(t, "name_latin_as_printed") ?? "",
    transcript_dob: str(t, "date_of_birth"),
    transcript_grad_date: str(t, "date_graduated"),
    certificate_grad_date: str(c, "date_conferred"),
    english_test_name: str(e, "name_latin_as_printed"),
    english_test_dob: str(e, "date_of_birth"),
    english_test_date: str(e, "test_date"),
    course_end_date: courseEnd,
    submission_target: submissionTarget,
  };
}
