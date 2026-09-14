#!/usr/bin/env node
// Seed five mock students whose four documents are already confirmed, so the
// case is Ready and the assistant can be asked about programmes.
//
//   DATABASE_URL=... S3_BUCKET=... node scripts/seed-demo.mjs
//
// Names, dates of birth and passport details come from the synthetic corpus
// (extractor/evals/datasets/synth-NNNN.truth.json); qualification, field, GPA
// and IELTS bands are set per persona so the programme conversation has
// variety. Every date is chosen so rules R1–R5 pass. Page images are rendered
// from small HTML templates with headless Chrome; if Chrome is missing the
// script falls back to out/synth-0000.*.png and says so. Idempotent: a case
// that already exists is skipped.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const url = process.env.DATABASE_URL;
const bucket = process.env.S3_BUCKET;
if (!url || !bucket) {
  console.error("DATABASE_URL and S3_BUCKET are required");
  process.exit(1);
}

// ---------------------------------------------------------------- personas
const PERSONAS = [
  { case_id: "0501", truth: "synth-0002", country: "AU", intake: "2027-02", qualification: "Bachelor of Business Administration", field: "Business Administration", institution: "Kasetsart University", gpa: 3.1, bands: [6.5, 6.5, 6.0, 6.5], years: 4 },
  { case_id: "0502", truth: "synth-0003", country: "AU", intake: "2027-07", qualification: "Bachelor of Science", field: "Computer Science", institution: "Chulalongkorn University", gpa: 3.45, bands: [7.0, 7.0, 6.5, 7.0], years: 4 },
  { case_id: "0503", truth: "synth-0005", country: "AU", intake: "2027-02", qualification: "Mathayom 6", field: "Science-Mathematics", institution: null, gpa: 3.2, bands: [6.0, 6.0, 5.5, 6.0], years: 3 },
  { case_id: "0504", truth: "synth-0006", country: "NZ", intake: "2027-02", qualification: "Bachelor of Nursing", field: "Nursing", institution: "Mahidol University", gpa: 2.9, bands: [6.5, 6.5, 6.5, 6.5], years: 4 },
  { case_id: "0505", truth: "synth-0010", country: "AU", intake: "2027-07", qualification: "Mathayom 6", field: "Arts-Languages", institution: null, gpa: 2.6, bands: [5.5, 5.5, 5.0, 5.5], years: 3 },
];

// ---------------------------------------------------------------- dates
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (isoDate, n) => iso(new Date(Date.UTC(...isoDate.split("-").map(Number).map((v, i) => (i === 1 ? v - 1 : v))) + n * 86400000));
const addMonths = (isoDate, n) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, d));
  return iso(t);
};
const halfBand = (x) => Math.round(x * 2) / 2;
const overallOf = (bands) => halfBand(bands.reduce((a, b) => a + b, 0) / bands.length);
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const long = (d) => { const [y, m, dd] = d.split("-").map(Number); return `${dd} ${MONTH[m - 1]} ${y}`; };

function student(p, i) {
  const t = JSON.parse(readFileSync(path.join(root, "extractor", "evals", "datasets", `${p.truth}.truth.json`), "utf8"));
  const intake = `${p.intake}-01`;
  const target = addMonths(intake, -4);
  const courseEnd = addMonths(intake, 36);
  const minExpiry = addMonths(courseEnd, 8);
  const passportExpiry = t.passport.passport_expiry > minExpiry ? t.passport.passport_expiry : addMonths(courseEnd, 60);
  const graduated = t.transcript.date_graduated < target ? t.transcript.date_graduated : addDays(target, -200);
  const name = `${t.passport.given_name_latin} ${t.passport.surname_latin}`;
  const daysAgo = 9 - i;
  const created = (h) => new Date(Date.now() - daysAgo * 86400000 + h * 3600000).toISOString();
  return {
    ...p,
    given: t.passport.given_name_latin,
    surname: t.passport.surname_latin,
    name,
    dob: t.passport.date_of_birth,
    target,
    courseEnd,
    passportExpiry,
    graduated,
    conferred: addDays(graduated, 45),
    enrolled: addMonths(graduated, -12 * p.years),
    testDate: addDays(target, -300),
    testCentre: t.english_test.test_centre,
    school: p.institution ?? t.transcript.institution_name,
    overall: overallOf(p.bands),
    calendar: t.transcript.date_source_calendar ?? "AD",
    createdAt: created(0),
    confirmedAt: created(20),
  };
}

// ---------------------------------------------------------------- extraction records
const FIELDS = {
  passport: ["given_name_latin", "surname_latin", "name_th", "date_of_birth", "nationality", "passport_expiry", "issuing_country", "passport_number_present"],
  transcript: ["name_latin_as_printed", "name_th", "date_of_birth", "institution_name", "qualification", "gpa", "gpa_scale", "date_enrolled", "date_graduated", "medium_of_instruction", "major"],
  degree_certificate: ["name_latin_as_printed", "qualification", "institution_name", "date_conferred", "field_of_study"],
  english_test: ["test_type", "name_latin_as_printed", "date_of_birth", "test_date", "overall", "listening", "reading", "writing", "speaking", "report_number_present"],
};

function values(s, type) {
  switch (type) {
    case "passport":
      return { given_name_latin: s.given, surname_latin: s.surname, name_th: null, date_of_birth: s.dob, nationality: "THA", passport_expiry: s.passportExpiry, issuing_country: "THA", passport_number_present: true };
    case "transcript":
      return { name_latin_as_printed: s.name, name_th: null, date_of_birth: s.dob, institution_name: s.school, qualification: s.qualification, gpa: s.gpa, gpa_scale: 4.0, date_enrolled: s.enrolled, date_graduated: s.graduated, medium_of_instruction: "Thai", major: s.field };
    case "degree_certificate":
      return { name_latin_as_printed: s.name, qualification: s.qualification, institution_name: s.school, date_conferred: s.conferred, field_of_study: s.field };
    case "english_test":
      return { test_type: "IELTS", name_latin_as_printed: s.name, date_of_birth: s.dob, test_date: s.testDate, overall: s.overall, listening: s.bands[0], reading: s.bands[1], writing: s.bands[2], speaking: s.bands[3], report_number_present: true };
  }
}

function records(s, type) {
  const v = values(s, type);
  const present = FIELDS[type].filter((k) => v[k] !== null);
  const extracted = {
    doc_type: type,
    ...v,
    field_confidence: Object.fromEntries(present.map((k) => [k, "high"])),
    field_source_page: Object.fromEntries(present.map((k) => [k, 1])),
    fields_unreadable: [],
    low_precision_dates: [],
    date_source_calendar: type === "transcript" ? s.calendar : "AD",
    suspicious_content: null,
  };
  const confirmations = Object.fromEntries(present.map((k) => [k, v[k]]));
  const confirmed = { doc_type: type, date_source_calendar: extracted.date_source_calendar, fields: Object.fromEntries(FIELDS[type].map((k) => [k, v[k] ?? null])), confirmed_at: s.confirmedAt };
  return { extracted, confirmations, confirmed };
}

// ---------------------------------------------------------------- page images
const CSS = "body{margin:0;width:820px;min-height:960px;font-family:Georgia,'Times New Roman',serif;color:#1f2937;background:#fff;padding:48px;box-sizing:border-box}.k{color:#6b7280;font-size:13px;letter-spacing:.08em;text-transform:uppercase}.v{font-size:20px;margin:2px 0 14px}.hd{font-size:26px;letter-spacing:.14em;text-align:center;margin:0 0 6px}.sub{text-align:center;color:#6b7280;font-size:14px;letter-spacing:.2em;margin-bottom:34px}table{border-collapse:collapse;width:100%;font-size:15px}td,th{border-bottom:1px solid #e5e7eb;padding:8px 6px;text-align:left}.seal{width:90px;height:90px;border:3px double #9ca3af;border-radius:50%;margin:30px auto 0;color:#9ca3af;font-size:11px;display:flex;align-items:center;justify-content:center;text-align:center}.mrz{font-family:'Courier New',monospace;font-size:18px;letter-spacing:2px;margin-top:40px;background:#f3f4f6;padding:14px}";
const th = (s) => `<span class="k">${s}</span>`;
function html(s, type) {
  const body = {
    passport: `<p class="hd">KINGDOM OF THAILAND · PASSPORT</p><p class="sub">ราชอาณาจักรไทย · หนังสือเดินทาง</p>
      <div style="display:grid;grid-template-columns:200px 1fr;gap:30px"><div style="width:180px;height:230px;background:#e5e7eb"></div><div>
      ${th("Type")}<div class="v">P</div>${th("Country code")}<div class="v">THA</div>${th("Passport no.")}<div class="v">XXXXXXXX</div>
      ${th("Surname")}<div class="v">${s.surname}</div>${th("Given name")}<div class="v">${s.given}</div>${th("Nationality")}<div class="v">THAI (THA)</div>
      ${th("Date of birth")}<div class="v">${long(s.dob).toUpperCase()}</div>${th("Date of expiry")}<div class="v">${long(s.passportExpiry).toUpperCase()}</div></div></div>
      <div class="mrz">P&lt;THA${s.surname}&lt;&lt;${s.given}${"<".repeat(Math.max(1, 44 - 6 - s.surname.length - s.given.length))}<br>XXXXXXXXX0THA${s.dob.slice(2).replace(/-/g, "")}0${s.passportExpiry.slice(2).replace(/-/g, "")}${"<".repeat(14)}</div>`,
    transcript: `<p class="hd">${s.school.toUpperCase()}</p><p class="sub">OFFICIAL ACADEMIC TRANSCRIPT</p>
      ${th("Name")}<div class="v">${s.name}</div>${th("Date of birth")}<div class="v">${s.calendar === "BE" ? long(s.dob).replace(/\\d{4}$/, (y) => String(Number(y) + 543)) : long(s.dob)}</div>
      ${th("Programme")}<div class="v">${s.qualification} · ${s.field}</div>
      <table><tr><th>Year</th><th>Credits</th><th>GPA</th></tr>${Array.from({ length: s.years }, (_, i) => `<tr><td>Year ${i + 1}</td><td>${s.years === 3 ? 12 : 36}</td><td>${(s.gpa + (i % 2 ? 0.08 : -0.08)).toFixed(2)}</td></tr>`).join("")}</table>
      <div style="margin-top:22px">${th("Cumulative GPA")}<div class="v">${s.gpa.toFixed(2)} / 4.00</div>${th("Date of graduation")}<div class="v">${s.calendar === "BE" ? long(s.graduated).replace(/\\d{4}$/, (y) => String(Number(y) + 543)) + " BE" : long(s.graduated)}</div></div>
      <div class="seal">REGISTRAR</div>`,
    degree_certificate: `<div style="text-align:center"><p class="hd">${s.school.toUpperCase()}</p><p class="sub">BY AUTHORITY OF THE UNIVERSITY COUNCIL</p>
      <p style="font-size:16px">hereby confers upon</p><p style="font-size:30px;margin:8px 0">${s.name}</p><p style="font-size:16px">the degree of</p>
      <p style="font-size:26px;margin:8px 0">${s.qualification}</p><p style="font-size:18px">in ${s.field}</p>
      <p style="margin-top:36px;font-size:15px">with all the rights, privileges and honours thereunto appertaining.</p>
      <p style="margin-top:36px;font-size:15px">Given on ${long(s.conferred)}</p><div class="seal">SEAL</div></div>`,
    english_test: `<p class="hd">IELTS · TEST REPORT FORM</p><p class="sub">ACADEMIC</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 30px">${th("Candidate name")}<span></span><div class="v">${s.name}</div><span></span>
      ${th("Date of birth")}${th("Test date")}<div class="v">${long(s.dob)}</div><div class="v">${long(s.testDate)}</div>
      ${th("Test centre")}${th("Report number")}<div class="v">${s.testCentre}</div><div class="v">XXXXXXXXX</div></div>
      <table style="margin-top:20px"><tr><th>Listening</th><th>Reading</th><th>Writing</th><th>Speaking</th><th>Overall</th></tr>
      <tr><td>${s.bands[0].toFixed(1)}</td><td>${s.bands[1].toFixed(1)}</td><td>${s.bands[2].toFixed(1)}</td><td>${s.bands[3].toFixed(1)}</td><td><b>${s.overall.toFixed(1)}</b></td></tr></table>
      <div class="seal">IELTS</div>`,
  }[type];
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;
}

const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "google-chrome", "chromium", "chromium-browser"];
function chromePath() {
  for (const c of CHROME) {
    if (c.startsWith("/") ? existsSync(c) : (() => { try { execFileSync("which", [c], { stdio: "ignore" }); return true; } catch { return false; } })()) return c;
  }
  return null;
}
let usedFallback = false;
function render(s, type) {
  const outDir = path.join(root, "out", "demo");
  mkdirSync(outDir, { recursive: true });
  const htmlFile = path.join(outDir, `${s.case_id}.${type}.html`);
  const png = path.join(outDir, `${s.case_id}.${type}.png`);
  writeFileSync(htmlFile, html(s, type));
  const chrome = chromePath();
  if (chrome && !existsSync(png)) {
    try {
      execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--window-size=820,1000", `--screenshot=${png}`, `file://${htmlFile}`], { stdio: "ignore", timeout: 30000 });
    } catch {
      /* fall through to the fallback below */
    }
  }
  if (existsSync(png)) return readFileSync(png);
  usedFallback = true;
  const fallback = path.join(root, "out", `synth-0000.${type === "degree_certificate" ? "passport" : type}.png`);
  return readFileSync(fallback);
}

// ---------------------------------------------------------------- storage
const u = new URL(url);
const sslmode = u.searchParams.get("sslmode");
u.searchParams.delete("sslmode");
const ssl = sslmode && sslmode !== "disable" ? (process.env.PG_CA_CERT_PATH ? { ca: readFileSync(process.env.PG_CA_CERT_PATH, "utf8"), rejectUnauthorized: true } : { rejectUnauthorized: false }) : undefined;
const db = new pg.Client({ connectionString: u.toString(), ssl });
const endpoint = process.env.S3_ENDPOINT || undefined;
const s3 = new S3Client({ region: process.env.AWS_REGION ?? "ap-southeast-2", endpoint, forcePathStyle: Boolean(endpoint) || process.env.S3_FORCE_PATH_STYLE === "true" });
const sse = process.env.S3_KMS_KEY_ID ? { ServerSideEncryption: "aws:kms", SSEKMSKeyId: process.env.S3_KMS_KEY_ID } : endpoint ? {} : { ServerSideEncryption: "AES256" };
const put = (Key, Body) => s3.send(new PutObjectCommand({ Bucket: bucket, Key, Body, ContentType: "image/png", ...sse }));

const TYPES = ["passport", "transcript", "degree_certificate", "english_test"];
const counts = { seeded: 0, skipped: 0, documents: 0 };
await db.connect();
try {
  for (const [i, p] of PERSONAS.entries()) {
    const exists = await db.query("SELECT 1 FROM cases WHERE case_id = $1", [p.case_id]);
    if (exists.rowCount) {
      counts.skipped++;
      continue;
    }
    const s = student(p, i);
    await db.query("BEGIN");
    try {
      await db.query(
        `INSERT INTO cases (case_id, country, course_end_date, submission_target, program_id, status, intake, assignee, acknowledged, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NULL, 'open', $5, 'Ploy K.', '{}'::jsonb, $6, $7)`,
        [s.case_id, s.country, s.courseEnd, s.target, s.intake, s.createdAt, s.confirmedAt],
      );
      for (const [n, type] of TYPES.entries()) {
        const uploadId = randomUUID();
        const docId = randomUUID();
        const key = `cases/${s.case_id}/uploads/${uploadId}/p0`;
        const bytes = render(s, type);
        await put(key, bytes);
        const classification = { doc_type: type, confidence: "high", reason: "seeded demo record", is_continuation: false };
        const filename = `${s.truth}.${type}.png`;
        const createdAt = new Date(new Date(s.createdAt).getTime() + n * 60000).toISOString();
        await db.query("INSERT INTO uploads (id, case_id, created_at, suggested_type, status, held_reason, document_id) VALUES ($1, $2, $3, $4, 'extracted', NULL, $5)", [uploadId, s.case_id, createdAt, type, docId]);
        await db.query("INSERT INTO upload_pages (upload_id, page_no, filename, content_type, classification, object_key, size_bytes) VALUES ($1, 0, $2, 'image/png', $3::jsonb, $4, $5)", [uploadId, filename, JSON.stringify(classification), key, bytes.byteLength]);
        const r = records(s, type);
        await db.query(
          `INSERT INTO documents (id, case_id, doc_type, filename, content_type, created_at, upload_id, page_count, classification, superseded_by, extracted_json, confirmations, requests, confirmed_json, image_key)
           VALUES ($1, $2, $3, $4, 'image/png', $5, $6, 1, $7::jsonb, NULL, $8::jsonb, $9::jsonb, '[]'::jsonb, $10::jsonb, NULL)`,
          [docId, s.case_id, type, filename, createdAt, uploadId, JSON.stringify(classification), JSON.stringify(r.extracted), JSON.stringify(r.confirmations), JSON.stringify(r.confirmed)],
        );
        counts.documents++;
      }
      await db.query("COMMIT");
      counts.seeded++;
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }
  }
} finally {
  await db.end();
}
console.log(JSON.stringify(counts));
if (usedFallback) console.log("note: headless Chrome was not available for some pages; placeholder images from out/ were used");

const web = process.env.WEB_URL ?? "http://localhost:3000";
try {
  const r = await fetch(`${web}/api/profiles/reindex`, { method: "POST", signal: AbortSignal.timeout(120000) });
  console.log(`profiles reindexed: ${await r.text()}`);
} catch {
  console.log(`next: POST ${web}/api/profiles/reindex to build case profiles`);
}
