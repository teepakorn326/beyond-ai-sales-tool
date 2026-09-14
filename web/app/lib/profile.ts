// Pure builders for similar-case search and duplicate-student detection.
// No I/O, no `server-only`, so the tests run under plain Node.
//
// The profile is built from an ALLOWLIST of confirmed fields. Names, dates of
// birth, document numbers, dates and scores never enter it, so the string
// can be embedded by an external model and shown on another case's overview
// without disclosing anything about the student.

import { createHash } from "node:crypto";

import type { CaseMeta } from "./case-status";
import type { FieldValue, ReviewDocument } from "../types";

export const PROFILE_FIELDS = {
  transcript: ["institution_name", "qualification", "major"],
  degree_certificate: ["institution_name", "qualification", "field_of_study"],
  english_test: ["test_type", "overall"],
} as const;

/** 6.5 → "6.5-7.0": a half-band bucket, never the exact score. */
export function scoreBand(overall: number): string {
  const lo = Math.floor(overall * 2) / 2;
  return `${lo.toFixed(1)}-${(lo + 0.5).toFixed(1)}`;
}

function latestConfirmed(docs: readonly ReviewDocument[], type: string): Record<string, FieldValue> | null {
  const hit = docs
    .filter((d) => d.doc_type === type && d.superseded_by === null && d.confirmed_json !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return hit?.confirmed_json?.fields ?? null;
}

const clean = (v: FieldValue): string | null => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ") : null);

/**
 * PII-free description of a case. Reads confirmed_json only: an unconfirmed
 * extraction contributes nothing. Returns null when nothing confirmed
 * contributes, so a case with only a passport has no profile.
 */
export function buildCaseProfile(meta: Pick<CaseMeta, "country" | "intake" | "program_id">, docs: readonly ReviewDocument[]): string | null {
  const parts: string[] = [`destination: ${meta.country}`];
  if (meta.intake) parts.push(`intake: ${meta.intake}`);
  if (meta.program_id) parts.push(`programme: ${meta.program_id}`);

  const t = latestConfirmed(docs, "transcript");
  const c = latestConfirmed(docs, "degree_certificate");
  const institution = clean(c?.institution_name ?? null) ?? clean(t?.institution_name ?? null);
  const qualification = clean(c?.qualification ?? null) ?? clean(t?.qualification ?? null);
  const field = clean(c?.field_of_study ?? null) ?? clean(t?.major ?? null);
  let contributed = false;
  if (institution) (parts.push(`institution: ${institution}`), (contributed = true));
  if (qualification) (parts.push(`qualification: ${qualification}`), (contributed = true));
  if (field) (parts.push(`field: ${field}`), (contributed = true));

  const e = latestConfirmed(docs, "english_test");
  const testType = clean(e?.test_type ?? null);
  const overall = typeof e?.overall === "number" ? e.overall : null;
  if (testType || overall !== null) {
    parts.push(`english: ${testType ?? "test"}${overall !== null ? ` band ${scoreBand(overall)}` : ""}`);
    contributed = true;
  }
  return contributed ? parts.join("; ") : null;
}

export function normaliseIdentityPart(s: string): string {
  return s.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Salted SHA-256 of the three passport fields that identify a person. Null
 * unless all three are present and the date is a full ISO date. The hash is
 * the only thing stored; two cases with the same hash are the same student.
 */
export function identityHash(p: { surname_latin: FieldValue; given_name_latin: FieldValue; date_of_birth: FieldValue }, salt: string): string | null {
  const surname = typeof p.surname_latin === "string" ? normaliseIdentityPart(p.surname_latin) : "";
  const given = typeof p.given_name_latin === "string" ? normaliseIdentityPart(p.given_name_latin) : "";
  const dob = typeof p.date_of_birth === "string" ? p.date_of_birth.trim() : "";
  if (!salt || !surname || !given || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  return createHash("sha256").update(`${salt}\n${surname}\n${given}\n${dob}`).digest("hex");
}

/** Passport identity parts from the latest confirmed passport, or null. */
export function passportIdentity(docs: readonly ReviewDocument[]): { surname_latin: FieldValue; given_name_latin: FieldValue; date_of_birth: FieldValue } | null {
  const f = latestConfirmed(docs, "passport");
  if (!f) return null;
  return { surname_latin: f.surname_latin ?? null, given_name_latin: f.given_name_latin ?? null, date_of_birth: f.date_of_birth ?? null };
}
