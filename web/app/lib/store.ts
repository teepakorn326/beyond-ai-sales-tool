// File-backed document store, one JSON record plus image bytes per document.
//
// Postgres is in docker-compose but nothing writes to it yet; this keeps the
// review flow real end to end without adding a driver. Swapping it for a
// table is a change to this file only. Two properties matter more than the
// backing store and are enforced here regardless of it:
//
//   1. `extracted_json` is written once and frozen on read. An update that
//      changes it is refused.
//   2. `confirmed_json` is the only thing downstream is allowed to read.
//
// Two record kinds: an upload (a group of pages the sorter put together)
// and a document (one extraction of some pages). A document that came
// through the sorter points at its upload for its pages; a document from
// the manual single-type route keeps its own image.

import "server-only";

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  Classification,
  ClassifiedType,
  DocType,
  Extraction,
  ReviewDocument,
  UploadPage,
  UploadRecord,
} from "../types";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
const DOCS_DIR = path.join(DATA_DIR, "documents");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

export class StoreError extends Error {}

export interface PageBytes {
  filename: string;
  content_type: string;
  bytes: Uint8Array;
}

function deepFreeze<T extends object>(o: T): T {
  Object.freeze(o);
  for (const v of Object.values(o)) {
    if (v !== null && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
  }
  return o;
}

function safeId(id: string): string {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new StoreError("Invalid id");
  return id;
}

const recordPath = (id: string) => path.join(DOCS_DIR, `${safeId(id)}.json`);
const legacyImagePath = (id: string) => path.join(DOCS_DIR, `${safeId(id)}.image`);
const uploadPath = (id: string) => path.join(UPLOADS_DIR, `${safeId(id)}.json`);
const pagePath = (id: string, n: number) => path.join(UPLOADS_DIR, `${safeId(id)}.p${n}.image`);

async function writeAtomic(p: string, data: string | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, p);
}

async function readJsonDir<T>(dir: string, parse: (text: string) => T): Promise<T[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  return Promise.all(
    names.filter((n) => n.endsWith(".json")).map(async (n) => parse(await fs.readFile(path.join(dir, n), "utf8"))),
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function parseRecord(text: string): ReviewDocument {
  const raw = JSON.parse(text) as Partial<ReviewDocument> & Pick<ReviewDocument, "id" | "extracted_json">;
  // Records written before the sorter existed lack the newer fields.
  const doc: ReviewDocument = {
    ...(raw as ReviewDocument),
    upload_id: raw.upload_id ?? null,
    page_count: raw.page_count ?? 1,
    classification: raw.classification ?? null,
    superseded_by: raw.superseded_by ?? null,
  };
  deepFreeze(doc.extracted_json);
  return doc;
}

export async function listDocuments(opts: { includeSuperseded?: boolean } = {}): Promise<ReviewDocument[]> {
  const docs = await readJsonDir(DOCS_DIR, parseRecord);
  return docs
    .filter((d) => opts.includeSuperseded || d.superseded_by === null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getDocument(id: string): Promise<ReviewDocument | null> {
  try {
    return parseRecord(await fs.readFile(recordPath(id), "utf8"));
  } catch (e) {
    if (e instanceof StoreError) throw e;
    return null;
  }
}

/** The pages a document was extracted from, in order. */
export async function pagesOf(doc: ReviewDocument): Promise<PageBytes[]> {
  if (doc.upload_id) {
    const up = await getUpload(doc.upload_id);
    if (!up) throw new StoreError("The document's source upload was not found");
    return Promise.all(
      up.pages.map(async (p, n) => ({
        filename: p.filename,
        content_type: p.content_type,
        bytes: new Uint8Array(await fs.readFile(pagePath(up.id, n))),
      })),
    );
  }
  return [
    {
      filename: doc.filename,
      content_type: doc.content_type,
      bytes: new Uint8Array(await fs.readFile(legacyImagePath(doc.id))),
    },
  ];
}

export async function getImage(
  id: string,
  page = 0,
): Promise<{ bytes: Uint8Array; content_type: string } | null> {
  const doc = await getDocument(id);
  if (!doc) return null;
  const pages = await pagesOf(doc);
  const p = pages[page];
  return p ? { bytes: p.bytes, content_type: p.content_type } : null;
}

export interface NewDocument {
  case_id: string;
  doc_type: DocType;
  filename: string;
  content_type: string;
  extracted_json: Extraction;
  /** Either the bytes of a single manual upload... */
  bytes?: Uint8Array;
  /** ...or the upload the pages already live on. */
  upload_id?: string;
  page_count?: number;
  classification?: Classification | null;
}

export async function createDocument(input: NewDocument): Promise<ReviewDocument> {
  if (!input.bytes && !input.upload_id) throw new StoreError("A document needs an image or a source upload");
  const doc: ReviewDocument = {
    id: randomUUID(),
    case_id: input.case_id,
    doc_type: input.doc_type,
    filename: input.filename,
    content_type: input.content_type,
    created_at: new Date().toISOString(),
    upload_id: input.upload_id ?? null,
    page_count: input.page_count ?? 1,
    classification: input.classification ?? null,
    superseded_by: null,
    extracted_json: deepFreeze(input.extracted_json),
    confirmations: {},
    requests: [],
    confirmed_json: null,
  };
  if (input.bytes) await writeAtomic(legacyImagePath(doc.id), input.bytes);
  await writeAtomic(recordPath(doc.id), JSON.stringify(doc, null, 2));
  return doc;
}

/**
 * Read-modify-write. The mutator gets a record whose `extracted_json` is
 * frozen, and the result is refused if that part differs from what was read:
 * belt and braces around the one invariant this store exists to keep.
 */
export async function updateDocument(
  id: string,
  mutate: (doc: ReviewDocument) => ReviewDocument,
): Promise<ReviewDocument | null> {
  const doc = await getDocument(id);
  if (!doc) return null;
  const next = mutate(doc);
  if (JSON.stringify(next.extracted_json) !== JSON.stringify(doc.extracted_json)) {
    throw new StoreError("extracted_json is immutable; confirmations are written to confirmed_json only");
  }
  await writeAtomic(recordPath(id), JSON.stringify(next, null, 2));
  return next;
}

// ---------------------------------------------------------------------------
// Uploads (page groups from the sorter)
// ---------------------------------------------------------------------------

export interface NewUpload {
  case_id: string;
  pages: (PageBytes & { classification: Classification })[];
  suggested_type: ClassifiedType;
  status: "held" | "extracted";
  held_reason: string | null;
}

export async function createUpload(input: NewUpload): Promise<UploadRecord> {
  const up: UploadRecord = {
    id: randomUUID(),
    case_id: input.case_id,
    created_at: new Date().toISOString(),
    pages: input.pages.map(
      (p): UploadPage => ({ filename: p.filename, content_type: p.content_type, classification: p.classification }),
    ),
    suggested_type: input.suggested_type,
    status: input.status,
    held_reason: input.held_reason,
    document_id: null,
  };
  await Promise.all(input.pages.map((p, n) => writeAtomic(pagePath(up.id, n), p.bytes)));
  await writeAtomic(uploadPath(up.id), JSON.stringify(up, null, 2));
  return up;
}

export async function getUpload(id: string): Promise<UploadRecord | null> {
  try {
    return JSON.parse(await fs.readFile(uploadPath(id), "utf8")) as UploadRecord;
  } catch (e) {
    if (e instanceof StoreError) throw e;
    return null;
  }
}

export async function listUploads(caseId?: string): Promise<UploadRecord[]> {
  const ups = await readJsonDir(UPLOADS_DIR, (t) => JSON.parse(t) as UploadRecord);
  return ups
    .filter((u) => !caseId || u.case_id === caseId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function updateUpload(
  id: string,
  mutate: (up: UploadRecord) => UploadRecord,
): Promise<UploadRecord | null> {
  const up = await getUpload(id);
  if (!up) return null;
  const next = mutate(up);
  await writeAtomic(uploadPath(id), JSON.stringify(next, null, 2));
  return next;
}

export async function uploadPages(up: UploadRecord): Promise<PageBytes[]> {
  return Promise.all(
    up.pages.map(async (p, n) => ({
      filename: p.filename,
      content_type: p.content_type,
      bytes: new Uint8Array(await fs.readFile(pagePath(up.id, n))),
    })),
  );
}
