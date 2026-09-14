#!/usr/bin/env node
// One-shot import of a file-backed web/.data directory into Postgres + S3.
//   DATABASE_URL=... S3_BUCKET=... node scripts/import-data.mjs [dir]
// Rows are inserted with ON CONFLICT DO NOTHING: a re-import never overwrites
// (extracted_json stays immutable for imports too). Prints counts only.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const dir = path.resolve(process.argv[2] ?? process.env.DATA_DIR ?? ".data");
const url = process.env.DATABASE_URL;
const bucket = process.env.S3_BUCKET;
if (!url || !bucket) {
  console.error("DATABASE_URL and S3_BUCKET are required");
  process.exit(1);
}
// pg lets sslmode= in the URL override an explicit ssl option: strip it and configure TLS here.
const u = new URL(url);
const sslmode = u.searchParams.get("sslmode");
u.searchParams.delete("sslmode");
const ssl =
  sslmode && sslmode !== "disable"
    ? process.env.PG_CA_CERT_PATH
      ? { ca: readFileSync(process.env.PG_CA_CERT_PATH, "utf8"), rejectUnauthorized: true }
      : { rejectUnauthorized: false }
    : undefined;
const db = new pg.Client({ connectionString: u.toString(), ssl });
const endpoint = process.env.S3_ENDPOINT || undefined;
const s3 = new S3Client({ region: process.env.AWS_REGION ?? "ap-southeast-2", endpoint, forcePathStyle: Boolean(endpoint) || process.env.S3_FORCE_PATH_STYLE === "true" });
const sse = process.env.S3_KMS_KEY_ID ? { ServerSideEncryption: "aws:kms", SSEKMSKeyId: process.env.S3_KMS_KEY_ID } : endpoint ? {} : { ServerSideEncryption: "AES256" };

const put = (Key, Body, ContentType) => s3.send(new PutObjectCommand({ Bucket: bucket, Key, Body, ContentType, ...sse }));
const jsonFiles = (sub) => (existsSync(path.join(dir, sub)) ? readdirSync(path.join(dir, sub)).filter((n) => n.endsWith(".json")) : []);
const counts = { cases: 0, uploads: 0, pages: 0, documents: 0, skipped: 0 };

await db.connect();
try {
  const casesFile = path.join(dir, "cases.json");
  if (existsSync(casesFile)) {
    const all = JSON.parse(readFileSync(casesFile, "utf8"));
    for (const [id, m] of Object.entries(all)) {
      const r = await db.query(
        `INSERT INTO cases (case_id, country, course_end_date, submission_target, program_id, status, intake, assignee, acknowledged, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, COALESCE($10, now()), COALESCE($11, now())) ON CONFLICT (case_id) DO NOTHING`,
        [id, m.country === "NZ" ? "NZ" : "AU", m.course_end_date ?? null, m.submission_target ?? null, m.program_id ?? null, m.status === "archived" ? "archived" : "open", m.intake ?? null, m.assignee ?? null, JSON.stringify(m.acknowledged ?? {}), m.created_at ?? null, m.updated_at ?? null],
      );
      r.rowCount ? counts.cases++ : counts.skipped++;
    }
  }

  for (const name of jsonFiles("uploads")) {
    const u = JSON.parse(readFileSync(path.join(dir, "uploads", name), "utf8"));
    const exists = await db.query("SELECT 1 FROM uploads WHERE id = $1", [u.id]);
    if (exists.rowCount) {
      counts.skipped++;
      continue;
    }
    await db.query("BEGIN");
    try {
      await db.query("INSERT INTO uploads (id, case_id, created_at, suggested_type, status, held_reason, document_id) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
        u.id, u.case_id, u.created_at, u.suggested_type, u.status, u.held_reason ?? null, u.document_id ?? null,
      ]);
      for (const [n, p] of u.pages.entries()) {
        const bytes = readFileSync(path.join(dir, "uploads", `${u.id}.p${n}.image`));
        const key = `cases/${u.case_id}/uploads/${u.id}/p${n}`;
        await put(key, bytes, p.content_type);
        await db.query("INSERT INTO upload_pages (upload_id, page_no, filename, content_type, classification, object_key, size_bytes) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)", [
          u.id, n, p.filename, p.content_type, JSON.stringify(p.classification), key, bytes.byteLength,
        ]);
        counts.pages++;
      }
      await db.query("COMMIT");
      counts.uploads++;
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }
  }

  for (const name of jsonFiles("documents")) {
    const d = JSON.parse(readFileSync(path.join(dir, "documents", name), "utf8"));
    const exists = await db.query("SELECT 1 FROM documents WHERE id = $1", [d.id]);
    if (exists.rowCount) {
      counts.skipped++;
      continue;
    }
    let imageKey = null;
    const legacy = path.join(dir, "documents", `${d.id}.image`);
    if (!d.upload_id && existsSync(legacy)) {
      imageKey = `cases/${d.case_id}/documents/${d.id}/image`;
      await put(imageKey, readFileSync(legacy), d.content_type);
    }
    if (!d.upload_id && !imageKey) {
      counts.skipped++;
      continue;
    }
    await db.query(
      `INSERT INTO documents (id, case_id, doc_type, filename, content_type, created_at, upload_id, page_count, classification, superseded_by, extracted_json, confirmations, requests, confirmed_json, image_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15) ON CONFLICT (id) DO NOTHING`,
      [d.id, d.case_id, d.doc_type, d.filename, d.content_type, d.created_at, d.upload_id ?? null, d.page_count ?? 1, d.classification ? JSON.stringify(d.classification) : null, d.superseded_by ?? null, JSON.stringify(d.extracted_json), JSON.stringify(d.confirmations ?? {}), JSON.stringify(d.requests ?? []), d.confirmed_json ? JSON.stringify(d.confirmed_json) : null, imageKey],
    );
    counts.documents++;
  }
  console.log(JSON.stringify({ imported_from: path.relative(process.cwd(), dir) || ".", ...counts }));
  console.log("next: POST /api/profiles/reindex to build case profiles");
} finally {
  await db.end();
}
