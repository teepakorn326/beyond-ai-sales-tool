// Postgres-backed document store. Records are rows; page images are objects
// in S3 (see blobs.ts) and only their keys are stored here. Two properties
// matter more than the backing store and are enforced regardless of it:
//
//   1. `extracted_json` is written once and frozen on read. An update that
//      changes it is refused here (JSON comparison) and again by a database
//      trigger (SQLSTATE VDC01).
//   2. `confirmed_json` is the only thing downstream is allowed to read.
//
// Two record kinds: an upload (a group of pages the sorter put together)
// and a document (one extraction of some pages). A document that came
// through the sorter points at its upload for its pages; a document from
// the manual single-type route keeps its own image key.

import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import type {
  Classification,
  ClassifiedType,
  ConfirmedExtraction,
  DocType,
  DocumentRequest,
  Extraction,
  FieldValue,
  ReviewDocument,
  UploadPage,
  UploadRecord,
} from "../types";
import { deleteObjects, getObject, imageKey, pageKey, putObject } from "./blobs";
import { IMMUTABLE_SQLSTATE, pgCode, pool, withTx } from "./db";

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

const iso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());
const json = (v: unknown): string => JSON.stringify(v);

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const DOC_COLS =
  "id, case_id, doc_type, filename, content_type, created_at, upload_id, page_count, classification, superseded_by, extracted_json, confirmations, requests, confirmed_json";

interface DocRow {
  id: string;
  case_id: string;
  doc_type: DocType;
  filename: string;
  content_type: string;
  created_at: Date;
  upload_id: string | null;
  page_count: number;
  classification: Classification | null;
  superseded_by: string | null;
  extracted_json: Extraction;
  confirmations: Record<string, FieldValue>;
  requests: DocumentRequest[];
  confirmed_json: ConfirmedExtraction | null;
}

function rowToDoc(r: DocRow): ReviewDocument {
  return {
    id: r.id,
    case_id: r.case_id,
    doc_type: r.doc_type,
    filename: r.filename,
    content_type: r.content_type,
    created_at: iso(r.created_at),
    upload_id: r.upload_id,
    page_count: r.page_count,
    classification: r.classification,
    superseded_by: r.superseded_by,
    extracted_json: deepFreeze(r.extracted_json),
    confirmations: r.confirmations ?? {},
    requests: r.requests ?? [],
    confirmed_json: r.confirmed_json,
  };
}

export async function listDocuments(opts: { includeSuperseded?: boolean } = {}): Promise<ReviewDocument[]> {
  const { rows } = await pool().query<DocRow>(
    `SELECT ${DOC_COLS} FROM documents WHERE $1::boolean OR superseded_by IS NULL ORDER BY created_at DESC`,
    [opts.includeSuperseded ?? false],
  );
  return rows.map(rowToDoc);
}

export async function getDocument(id: string): Promise<ReviewDocument | null> {
  const { rows } = await pool().query<DocRow>(`SELECT ${DOC_COLS} FROM documents WHERE id = $1`, [safeId(id)]);
  return rows[0] ? rowToDoc(rows[0]) : null;
}

interface PageRow {
  filename: string;
  content_type: string;
  object_key: string;
}

async function pageRows(uploadId: string, page?: number): Promise<PageRow[]> {
  const { rows } = await pool().query<PageRow>(
    `SELECT filename, content_type, object_key FROM upload_pages WHERE upload_id = $1 AND ($2::int IS NULL OR page_no = $2) ORDER BY page_no`,
    [safeId(uploadId), page ?? null],
  );
  return rows;
}

async function imageRow(docId: string): Promise<PageRow> {
  const { rows } = await pool().query<{ filename: string; content_type: string; image_key: string | null }>(
    "SELECT filename, content_type, image_key FROM documents WHERE id = $1",
    [safeId(docId)],
  );
  const r = rows[0];
  if (!r?.image_key) throw new StoreError("The document has no stored image");
  return { filename: r.filename, content_type: r.content_type, object_key: r.image_key };
}

async function fetchPages(rows: PageRow[]): Promise<PageBytes[]> {
  return Promise.all(rows.map(async (r) => ({ filename: r.filename, content_type: r.content_type, bytes: await getObject(r.object_key) })));
}

/** The pages a document was extracted from, in order. */
export async function pagesOf(doc: ReviewDocument): Promise<PageBytes[]> {
  if (doc.upload_id) {
    const rows = await pageRows(doc.upload_id);
    if (rows.length === 0) throw new StoreError("The document's source upload was not found");
    return fetchPages(rows);
  }
  return fetchPages([await imageRow(doc.id)]);
}

/** One page's bytes. Fetches exactly one object, never the whole document. */
export async function getImage(id: string, page = 0): Promise<{ bytes: Uint8Array; content_type: string } | null> {
  const doc = await getDocument(id);
  if (!doc) return null;
  let row: PageRow | undefined;
  if (doc.upload_id) row = (await pageRows(doc.upload_id, page))[0];
  else if (page === 0) row = await imageRow(doc.id);
  if (!row) return null;
  return { bytes: await getObject(row.object_key), content_type: row.content_type };
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
  const key = input.bytes ? imageKey(doc.case_id, doc.id) : null;
  if (input.bytes && key) await putObject(key, input.bytes, doc.content_type);
  try {
    await pool().query(
      `INSERT INTO documents (${DOC_COLS}, image_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15)`,
      [
        doc.id,
        doc.case_id,
        doc.doc_type,
        doc.filename,
        doc.content_type,
        doc.created_at,
        doc.upload_id,
        doc.page_count,
        doc.classification === null ? null : json(doc.classification),
        doc.superseded_by,
        json(doc.extracted_json),
        json(doc.confirmations),
        json(doc.requests),
        null,
        key,
      ],
    );
  } catch (e) {
    if (key) await deleteObjects([key]).catch(() => undefined);
    throw e;
  }
  return doc;
}

/**
 * Read-modify-write inside a transaction with a row lock. The mutator gets a
 * record whose `extracted_json` is frozen; the result is refused if that part
 * differs from what was read, and `extracted_json` is never in the SET list.
 * The trigger in db/schema.sql is the third line of defence.
 */
export async function updateDocument(id: string, mutate: (doc: ReviewDocument) => ReviewDocument): Promise<ReviewDocument | null> {
  safeId(id);
  try {
    return await withTx(async (c) => {
      const { rows } = await c.query<DocRow>(`SELECT ${DOC_COLS} FROM documents WHERE id = $1 FOR UPDATE`, [id]);
      if (!rows[0]) return null;
      const doc = rowToDoc(rows[0]);
      const next = mutate(doc);
      if (JSON.stringify(next.extracted_json) !== JSON.stringify(doc.extracted_json)) {
        throw new StoreError("extracted_json is immutable; confirmations are written to confirmed_json only");
      }
      await c.query(
        `UPDATE documents SET case_id = $2, doc_type = $3, filename = $4, content_type = $5, upload_id = $6, page_count = $7,
           classification = $8::jsonb, superseded_by = $9, confirmations = $10::jsonb, requests = $11::jsonb, confirmed_json = $12::jsonb
         WHERE id = $1`,
        [
          id,
          next.case_id,
          next.doc_type,
          next.filename,
          next.content_type,
          next.upload_id,
          next.page_count,
          next.classification === null ? null : json(next.classification),
          next.superseded_by,
          json(next.confirmations),
          json(next.requests),
          next.confirmed_json === null ? null : json(next.confirmed_json),
        ],
      );
      return next;
    });
  } catch (e) {
    if (pgCode(e) === IMMUTABLE_SQLSTATE) throw new StoreError("extracted_json is immutable; confirmations are written to confirmed_json only");
    throw e;
  }
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

interface UploadRow {
  id: string;
  case_id: string;
  created_at: Date;
  suggested_type: ClassifiedType;
  status: UploadRecord["status"];
  held_reason: string | null;
  document_id: string | null;
  pages: UploadPage[];
}

const UPLOAD_SELECT = `
  SELECT u.id, u.case_id, u.created_at, u.suggested_type, u.status, u.held_reason, u.document_id,
         COALESCE(jsonb_agg(jsonb_build_object('filename', p.filename, 'content_type', p.content_type, 'classification', p.classification)
                            ORDER BY p.page_no) FILTER (WHERE p.upload_id IS NOT NULL), '[]'::jsonb) AS pages
  FROM uploads u LEFT JOIN upload_pages p ON p.upload_id = u.id`;

function rowToUpload(r: UploadRow): UploadRecord {
  return {
    id: r.id,
    case_id: r.case_id,
    created_at: iso(r.created_at),
    pages: r.pages,
    suggested_type: r.suggested_type,
    status: r.status,
    held_reason: r.held_reason,
    document_id: r.document_id,
  };
}

export async function createUpload(input: NewUpload): Promise<UploadRecord> {
  const up: UploadRecord = {
    id: randomUUID(),
    case_id: input.case_id,
    created_at: new Date().toISOString(),
    pages: input.pages.map((p): UploadPage => ({ filename: p.filename, content_type: p.content_type, classification: p.classification })),
    suggested_type: input.suggested_type,
    status: input.status,
    held_reason: input.held_reason,
    document_id: null,
  };
  const keys = input.pages.map((_, n) => pageKey(up.case_id, up.id, n));
  await Promise.all(input.pages.map((p, n) => putObject(keys[n], p.bytes, p.content_type)));
  try {
    await withTx(async (c) => {
      await c.query(
        "INSERT INTO uploads (id, case_id, created_at, suggested_type, status, held_reason, document_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [up.id, up.case_id, up.created_at, up.suggested_type, up.status, up.held_reason, up.document_id],
      );
      for (const [n, p] of input.pages.entries()) {
        await c.query(
          "INSERT INTO upload_pages (upload_id, page_no, filename, content_type, classification, object_key, size_bytes) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)",
          [up.id, n, p.filename, p.content_type, json(p.classification), keys[n], p.bytes.byteLength],
        );
      }
    });
  } catch (e) {
    await deleteObjects(keys).catch(() => undefined);
    throw e;
  }
  return up;
}

export async function getUpload(id: string): Promise<UploadRecord | null> {
  const { rows } = await pool().query<UploadRow>(`${UPLOAD_SELECT} WHERE u.id = $1 GROUP BY u.id`, [safeId(id)]);
  return rows[0] ? rowToUpload(rows[0]) : null;
}

export async function listUploads(caseId?: string): Promise<UploadRecord[]> {
  const { rows } = await pool().query<UploadRow>(
    `${UPLOAD_SELECT} WHERE $1::text IS NULL OR u.case_id = $1 GROUP BY u.id ORDER BY u.created_at ASC`,
    [caseId ?? null],
  );
  return rows.map(rowToUpload);
}

export async function updateUpload(id: string, mutate: (up: UploadRecord) => UploadRecord): Promise<UploadRecord | null> {
  safeId(id);
  return withTx(async (c: PoolClient) => {
    await c.query("SELECT id FROM uploads WHERE id = $1 FOR UPDATE", [id]);
    const { rows } = await c.query<UploadRow>(`${UPLOAD_SELECT} WHERE u.id = $1 GROUP BY u.id`, [id]);
    if (!rows[0]) return null;
    const next = mutate(rowToUpload(rows[0]));
    await c.query("UPDATE uploads SET suggested_type = $2, status = $3, held_reason = $4, document_id = $5 WHERE id = $1", [
      id,
      next.suggested_type,
      next.status,
      next.held_reason,
      next.document_id,
    ]);
    return next;
  });
}

export async function uploadPages(up: UploadRecord): Promise<PageBytes[]> {
  return fetchPages(await pageRows(up.id));
}
