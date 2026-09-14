#!/usr/bin/env node
// Re-render stored upload pages that the browser cannot display (PDF, HEIC)
// into JPEG pages through the extractor's /render, in place. Uploads made
// before the intake rendered pages itself hold the original file as p0.
//   DATABASE_URL=... S3_BUCKET=... EXTRACTOR_URL=... node scripts/rerender-pages.mjs
// Idempotent: rows already holding image/* pages are skipped. Prints counts.
import { readFileSync } from "node:fs";
import pg from "pg";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const EXTRACTOR_URL = process.env.EXTRACTOR_URL ?? "http://localhost:8000";
const bucket = process.env.S3_BUCKET;
if (!process.env.DATABASE_URL || !bucket) {
  console.error("DATABASE_URL and S3_BUCKET are required");
  process.exit(2);
}
const u = new URL(process.env.DATABASE_URL);
const sslmode = u.searchParams.get("sslmode");
u.searchParams.delete("sslmode");
const ssl =
  sslmode && sslmode !== "disable"
    ? process.env.PG_CA_CERT_PATH
      ? { ca: readFileSync(process.env.PG_CA_CERT_PATH, "utf8"), rejectUnauthorized: true }
      : { rejectUnauthorized: false }
    : false;
const db = new pg.Client({ connectionString: u.toString(), ssl });
const endpoint = process.env.S3_ENDPOINT || undefined;
const s3 = new S3Client({ region: process.env.AWS_REGION ?? "ap-southeast-2", endpoint, forcePathStyle: Boolean(endpoint) || process.env.S3_FORCE_PATH_STYLE === "true" });
const sse = process.env.S3_KMS_KEY_ID ? { ServerSideEncryption: "aws:kms", SSEKMSKeyId: process.env.S3_KMS_KEY_ID } : endpoint ? {} : { ServerSideEncryption: "AES256" };
const put = (Key, Body, ContentType) => s3.send(new PutObjectCommand({ Bucket: bucket, Key, Body, ContentType, ...sse }));
const get = async (Key) => (await s3.send(new GetObjectCommand({ Bucket: bucket, Key }))).Body.transformToByteArray();

async function render(filename, contentType, bytes) {
  const form = new FormData();
  form.append("files", new File([bytes], filename, { type: contentType }), filename);
  const r = await fetch(`${EXTRACTOR_URL}/render`, { method: "POST", body: form });
  if (!r.ok) throw new Error(`render ${r.status}: ${await r.text()}`);
  const { files } = await r.json();
  return files[0].pages.map((p) => ({ content_type: p.media_type, bytes: Buffer.from(p.data, "base64") }));
}

await db.connect();
const { rows } = await db.query(
  `SELECT p.upload_id, p.page_no, p.filename, p.content_type, p.classification, p.object_key, u.case_id
     FROM upload_pages p JOIN uploads u ON u.id = p.upload_id
    WHERE p.content_type NOT LIKE 'image/%' OR p.content_type IN ('image/heic', 'image/heif')
    ORDER BY p.upload_id, p.page_no`,
);
let uploads = 0;
let pages = 0;
const byUpload = new Map();
for (const r of rows) byUpload.set(r.upload_id, [...(byUpload.get(r.upload_id) ?? []), r]);
for (const [uploadId, src] of byUpload) {
  if (src.some((r) => r.page_no !== src.indexOf(r)) || src.length !== (await db.query("SELECT count(*)::int AS n FROM upload_pages WHERE upload_id = $1", [uploadId])).rows[0].n) {
    console.log(`skip ${uploadId}: mixed page types`);
    continue;
  }
  const out = [];
  for (const r of src) out.push(...(await render(r.filename, r.content_type, await get(r.object_key))).map((p) => ({ ...p, filename: r.filename, classification: r.classification })));
  const caseId = src[0].case_id;
  const keys = out.map((_, n) => `cases/${caseId}/uploads/${uploadId}/p${n}`);
  await Promise.all(out.map((p, n) => put(keys[n], p.bytes, p.content_type)));
  await db.query("BEGIN");
  try {
    await db.query("DELETE FROM upload_pages WHERE upload_id = $1", [uploadId]);
    for (const [n, p] of out.entries()) {
      await db.query(
        "INSERT INTO upload_pages (upload_id, page_no, filename, content_type, classification, object_key, size_bytes) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)",
        [uploadId, n, p.filename, p.content_type, JSON.stringify(p.classification), keys[n], p.bytes.byteLength],
      );
    }
    await db.query("UPDATE documents SET page_count = $2, content_type = $3 WHERE upload_id = $1", [uploadId, out.length, out[0].content_type]);
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
  uploads++;
  pages += out.length;
}
await db.end();
console.log(JSON.stringify({ uploads_rerendered: uploads, pages_written: pages }));
