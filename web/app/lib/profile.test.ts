import assert from "node:assert/strict";
import { test } from "node:test";

import type { ReviewDocument } from "../types";
import { buildCaseProfile, identityHash, normaliseIdentityPart, scoreBand } from "./profile";

const NAME = "THANAWAT";
const SURNAME = "JAROENSUK";
const DOB = "2003-01-31";

function doc(type: ReviewDocument["doc_type"], fields: Record<string, string | number | boolean | null> | null, created = "2026-09-01T00:00:00.000Z"): ReviewDocument {
  return {
    id: `${type}-${created}`,
    case_id: "0414",
    doc_type: type,
    filename: "x.png",
    content_type: "image/png",
    created_at: created,
    upload_id: null,
    page_count: 1,
    classification: null,
    superseded_by: null,
    extracted_json: { doc_type: type, field_confidence: {}, field_source_page: {}, fields_unreadable: [], low_precision_dates: [], date_source_calendar: null, suspicious_content: null, given_name_latin: NAME, surname_latin: SURNAME, date_of_birth: DOB } as unknown as ReviewDocument["extracted_json"],
    confirmations: {},
    requests: [],
    confirmed_json: fields ? { doc_type: type, date_source_calendar: null, fields, confirmed_at: created } : null,
  };
}

const passport = doc("passport", { given_name_latin: NAME, surname_latin: SURNAME, date_of_birth: DOB, passport_expiry: "2032-06-06", nationality: "THA", passport_number_present: true });
const transcript = doc("transcript", { name_latin_as_printed: `${NAME} ${SURNAME}`, date_of_birth: DOB, institution_name: "Bangkok Christian College", qualification: "Mathayom 6", gpa: 3.12, gpa_scale: 4, date_graduated: "2026-02-28", major: "Science" });
const english = doc("english_test", { test_type: "IELTS", name_latin_as_printed: `${NAME} ${SURNAME}`, date_of_birth: DOB, test_date: "2024-08-26", overall: 6.5, report_number_present: true });

test("profile contains institution, qualification, field and band only", () => {
  const p = buildCaseProfile({ country: "AU", intake: "2027-02", program_id: null }, [passport, transcript, english]);
  assert.equal(p, "destination: AU; intake: 2027-02; institution: Bangkok Christian College; qualification: Mathayom 6; field: Science; english: IELTS band 6.5-7.0");
  for (const leak of [NAME, SURNAME, DOB, "2032-06-06", "2024-08-26", "3.12", "2026-02-28"]) assert.ok(!p!.includes(leak), `profile leaks ${leak}`);
});

test("unconfirmed documents contribute nothing", () => {
  const unconfirmed = { ...transcript, confirmed_json: null };
  assert.equal(buildCaseProfile({ country: "AU", intake: null, program_id: null }, [passport, unconfirmed]), null);
});

test("a case with only a confirmed passport has no profile", () => {
  assert.equal(buildCaseProfile({ country: "NZ", intake: "2027-07", program_id: "PRG-1" }, [passport]), null);
});

test("the latest confirmed document of a type wins and superseded ones are ignored", () => {
  const older = doc("transcript", { institution_name: "Old School", qualification: "Q" }, "2026-01-01T00:00:00.000Z");
  const superseded = { ...doc("transcript", { institution_name: "Wrong", qualification: "Q" }, "2026-12-01T00:00:00.000Z"), superseded_by: "x" };
  const p = buildCaseProfile({ country: "AU", intake: null, program_id: null }, [older, transcript, superseded]);
  assert.ok(p!.includes("Bangkok Christian College") && !p!.includes("Old School") && !p!.includes("Wrong"));
});

test("scoreBand buckets to half bands", () => {
  assert.equal(scoreBand(6.5), "6.5-7.0");
  assert.equal(scoreBand(6.0), "6.0-6.5");
  assert.equal(scoreBand(7.25), "7.0-7.5");
});

test("identityHash is stable, normalised, salt-sensitive and null when incomplete", () => {
  const a = identityHash({ surname_latin: SURNAME, given_name_latin: NAME, date_of_birth: DOB }, "salt-1");
  const b = identityHash({ surname_latin: " jaroensuk ", given_name_latin: "Thanawat", date_of_birth: DOB }, "salt-1");
  assert.ok(a && a.length === 64);
  assert.equal(a, b);
  assert.notEqual(a, identityHash({ surname_latin: SURNAME, given_name_latin: NAME, date_of_birth: DOB }, "salt-2"));
  assert.equal(identityHash({ surname_latin: SURNAME, given_name_latin: NAME, date_of_birth: "31/01/2003" }, "salt-1"), null);
  assert.equal(identityHash({ surname_latin: null, given_name_latin: NAME, date_of_birth: DOB }, "salt-1"), null);
  assert.equal(identityHash({ surname_latin: SURNAME, given_name_latin: NAME, date_of_birth: DOB }, ""), null);
  assert.ok(!a!.includes(SURNAME));
});

test("normaliseIdentityPart folds width, case and whitespace", () => {
  assert.equal(normaliseIdentityPart("ｊａｒｏｅｎｓｕｋ"), "JAROENSUK");
  assert.equal(normaliseIdentityPart("  van   der  berg "), "VAN DER BERG");
});
