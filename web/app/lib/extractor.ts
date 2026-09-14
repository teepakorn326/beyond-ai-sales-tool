// Server-side client for the Python extractor. The browser never talks to it
// directly, so no service URL or credential reaches the client.

import "server-only";

import {
  DOC_TYPES,
  FIELDS_FOR,
  type Case,
  type CheckResult,
  type Classification,
  type ClassifiedType,
  type Confidence,
  type DocType,
  type Extraction,
  type SourceCalendar,
} from "../types";

const BASE = process.env.EXTRACTOR_URL ?? "http://localhost:8000";

export class ExtractorError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface FilePart {
  filename: string;
  content_type: string;
  bytes: Uint8Array;
}

function upstreamMessage(text: string): string {
  try {
    const j: unknown = JSON.parse(text);
    if (j !== null && typeof j === "object") {
      if ("error" in j && typeof j.error === "string") return j.error;
      if ("detail" in j && typeof j.detail === "string") return j.detail;
    }
  } catch {
    /* not JSON */
  }
  return text;
}

async function call(pathname: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${pathname}`, { ...init, cache: "no-store" });
  } catch {
    throw new ExtractorError(502, "The extractor did not respond; check that the service is running");
  }
  if (!res.ok) throw new ExtractorError(res.status, upstreamMessage(await res.text()));
  return res;
}

function multipart(files: readonly FilePart[]): FormData {
  const form = new FormData();
  for (const f of files) {
    form.append("files", new File([f.bytes], f.filename, { type: f.content_type }), f.filename);
  }
  return form;
}

/** All files are pages of one document; the extractor reads them together. */
export async function extractDocument(docType: DocType, files: readonly FilePart[]): Promise<Extraction> {
  const res = await call(`/extract/${docType}`, { method: "POST", body: multipart(files) });
  return parseExtraction(await res.json(), docType);
}

const PAGE_TYPES: ReadonlySet<string> = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Every file rendered to browser-displayable pages, one list per file, in
 * order. A PDF becomes one JPEG per page; a photo becomes one page. These
 * are the pages that get stored, shown on the review screen and extracted,
 * so what the reviewer sees is exactly what the model read.
 */
export async function renderFiles(files: readonly FilePart[]): Promise<FilePart[][]> {
  const res = await call("/render", { method: "POST", body: multipart(files) });
  const raw: unknown = await res.json();
  if (!isRecord(raw) || !Array.isArray(raw.files) || raw.files.length !== files.length) {
    throw new ExtractorError(502, "render returned the wrong number of files");
  }
  return (raw.files as unknown[]).map((f, i) => {
    if (!isRecord(f) || !Array.isArray(f.pages) || f.pages.length === 0) {
      throw new ExtractorError(502, "render returned malformed pages");
    }
    return (f.pages as unknown[]).map((p): FilePart => {
      if (!isRecord(p) || typeof p.media_type !== "string" || !PAGE_TYPES.has(p.media_type) || typeof p.data !== "string") {
        throw new ExtractorError(502, "render returned a page that is not an image");
      }
      return { filename: files[i].filename, content_type: p.media_type, bytes: new Uint8Array(Buffer.from(p.data, "base64")) };
    });
  });
}

/** One Classification per file (its first page decides). */
export async function classifyFiles(files: readonly FilePart[]): Promise<Classification[]> {
  const res = await call("/classify", { method: "POST", body: multipart(files) });
  return parseClassifications(await res.json(), files.length);
}

export async function checkCase(c: Case): Promise<CheckResult> {
  const res = await call("/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(c),
  });
  return (await res.json()) as CheckResult;
}

// ---------------------------------------------------------------------------
// Validation at the boundary. Pydantic already checked this on the way out of
// the model; checking again on the way in means a wire-format drift between
// the two services fails here, loudly, rather than as a blank field in review.
// ---------------------------------------------------------------------------

const CONFIDENCES: ReadonlySet<string> = new Set(["high", "medium", "low"]);
const CLASSIFIED: ReadonlySet<string> = new Set([...DOC_TYPES, "other"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function stringList(v: unknown, what: string): string[] {
  if (!Array.isArray(v) || !v.every((s): s is string => typeof s === "string")) {
    throw new ExtractorError(502, `The extractor returned a malformed ${what}`);
  }
  return v;
}

export function parseClassification(raw: unknown): Classification {
  if (!isRecord(raw)) throw new ExtractorError(502, "classification is not an object");
  const t = raw.doc_type;
  if (typeof t !== "string" || !CLASSIFIED.has(t)) {
    throw new ExtractorError(502, `unknown classification.doc_type ${String(t)}`);
  }
  const c = raw.confidence;
  if (typeof c !== "string" || !CONFIDENCES.has(c)) {
    throw new ExtractorError(502, "malformed classification.confidence");
  }
  return {
    doc_type: t as ClassifiedType,
    confidence: c as Confidence,
    reason: typeof raw.reason === "string" ? raw.reason : "",
    is_continuation: raw.is_continuation === true,
  };
}

function parseClassifications(raw: unknown, expected: number): Classification[] {
  if (!isRecord(raw) || !Array.isArray(raw.files)) throw new ExtractorError(502, "classify returned malformed files");
  const files = raw.files as unknown[];
  if (files.length !== expected) throw new ExtractorError(502, "classify returned the wrong number of files");
  return files.map((f) => {
    if (!isRecord(f) || !Array.isArray(f.pages) || f.pages.length === 0) {
      throw new ExtractorError(502, "classify returned malformed pages");
    }
    return parseClassification(f.pages[0]);
  });
}

export function parseExtraction(raw: unknown, docType: DocType): Extraction {
  if (!isRecord(raw)) throw new ExtractorError(502, "The extractor did not return a JSON object");
  if (raw.doc_type !== docType) {
    throw new ExtractorError(502, `The extractor returned doc_type ${String(raw.doc_type)} instead of ${docType}`);
  }

  const field_confidence: Record<string, Confidence> = {};
  if (!isRecord(raw.field_confidence)) throw new ExtractorError(502, "malformed field_confidence");
  for (const [k, v] of Object.entries(raw.field_confidence)) {
    if (typeof v !== "string" || !CONFIDENCES.has(v)) {
      throw new ExtractorError(502, `malformed field_confidence.${k}`);
    }
    field_confidence[k] = v as Confidence;
  }

  const field_source_page: Record<string, number> = {};
  if (!isRecord(raw.field_source_page)) throw new ExtractorError(502, "malformed field_source_page");
  for (const [k, v] of Object.entries(raw.field_source_page)) {
    if (typeof v !== "number") throw new ExtractorError(502, `malformed field_source_page.${k}`);
    field_source_page[k] = v;
  }

  const cal = raw.date_source_calendar;
  let date_source_calendar: SourceCalendar | null;
  if (cal === "BE" || cal === "AD") date_source_calendar = cal;
  else if (cal === null || cal === undefined) date_source_calendar = null;
  else throw new ExtractorError(502, "malformed date_source_calendar");

  const sus = raw.suspicious_content;
  if (sus !== null && sus !== undefined && typeof sus !== "string") {
    throw new ExtractorError(502, "malformed suspicious_content");
  }

  const out: Record<string, unknown> = {
    doc_type: docType,
    field_confidence,
    field_source_page,
    fields_unreadable: stringList(raw.fields_unreadable ?? [], "fields_unreadable"),
    low_precision_dates: stringList(raw.low_precision_dates ?? [], "low_precision_dates"),
    date_source_calendar,
    suspicious_content: typeof sus === "string" ? sus : null,
  };

  // Only schema fields are kept, mirroring Pydantic's behaviour of dropping
  // anything the model added that was not asked for.
  for (const name of FIELDS_FOR[docType]) {
    const v = raw[name];
    if (v === undefined || v === null) {
      out[name] = name.endsWith("_present") ? false : null;
    } else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[name] = v;
    } else {
      throw new ExtractorError(502, `malformed field ${name}`);
    }
  }
  return out as unknown as Extraction;
}
