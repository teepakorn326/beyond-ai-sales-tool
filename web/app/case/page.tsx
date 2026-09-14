import Link from "next/link";

import { checkCase, ExtractorError } from "../lib/extractor";
import { buildCase, DOC_TYPE_LABELS } from "../lib/review";
import { listDocuments } from "../lib/store";
import { DOC_TYPES, type Case, type CheckResult } from "../types";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  pass: "#2F6B4F",
  warn: "#9C6410",
  block: "#933731",
  muted: "#7C8D95",
  line: "#D8DEDC",
};

type Search = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() !== "" ? s.trim() : null;
}

/**
 * Assembles the case from confirmed documents only and runs the rules engine
 * on it. Nothing here reads `extracted_json`; a document that is not fully
 * confirmed simply does not contribute, and the rule that needed it reports
 * pending, which blocks.
 */
export default async function CasePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const caseId = one(sp.case_id);
  const courseEnd = one(sp.course_end_date);
  const target = one(sp.submission_target);

  const docs = caseId ? (await listDocuments()).filter((d) => d.case_id === caseId) : [];
  const c: Case | null = caseId ? buildCase(docs, caseId, courseEnd, target) : null;

  let result: CheckResult | null = null;
  let failure: string | null = null;
  if (c) {
    try {
      result = await checkCase(c);
    } catch (e) {
      failure = e instanceof ExtractorError ? e.message : "The rules service did not respond";
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <Link href="/" style={{ fontSize: 13, color: TONE.muted }}>← All documents</Link>
      <h1 style={{ fontSize: 20, margin: "4px 0 12px" }}>Whole-case consistency check</h1>

      <form style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", fontSize: 14, background: "#fff", border: `1px solid ${TONE.line}`, borderRadius: 6, padding: 16 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Case id</span>
          <input name="case_id" defaultValue={caseId ?? ""} required style={{ padding: 6 }} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Course end date</span>
          <input name="course_end_date" type="date" defaultValue={courseEnd ?? ""} style={{ padding: 6 }} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Target submission date</span>
          <input name="submission_target" type="date" defaultValue={target ?? ""} style={{ padding: 6 }} />
        </label>
        <button type="submit" style={{ padding: "7px 14px", color: "#fff", background: "#17272E", border: 0, borderRadius: 4 }}>
          Check
        </button>
      </form>

      {caseId && (
        <section style={{ marginTop: 16, fontSize: 14 }}>
          <h2 style={{ fontSize: 15, margin: "0 0 6px" }}>Documents on the case</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {DOC_TYPES.map((t) => {
              const hits = docs.filter((d) => d.doc_type === t);
              const ok = hits.some((d) => d.confirmed_json !== null);
              return (
                <li key={t} style={{ display: "flex", gap: 10, padding: "4px 0" }}>
                  <span style={{ width: 160 }}>{DOC_TYPE_LABELS[t]}</span>
                  <span style={{ color: ok ? TONE.pass : hits.length ? TONE.warn : TONE.muted }}>
                    {ok ? "confirmed, used in the check" : hits.length ? "uploaded but not fully confirmed, so not used" : "not uploaded"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {failure && <p style={{ color: TONE.block, fontSize: 14 }}>{failure}</p>}

      {result && (
        <section style={{ marginTop: 16 }}>
          <p style={{ color: result.can_proceed ? TONE.pass : TONE.block, fontWeight: 600 }}>
            {result.can_proceed ? "All checks passed" : "Cannot be lodged yet"}
            <span style={{ color: TONE.muted, marginLeft: 8, fontSize: 13, fontWeight: 400 }}>
              {result.ruleset_version}
            </span>
          </p>
          {result.checks.map((ch) => (
            <div
              key={ch.rule_id}
              style={{ borderLeft: `3px solid ${TONE[ch.verdict]}`, padding: "10px 14px", marginBottom: 8, background: "#fff" }}
            >
              <div style={{ fontSize: 12, color: TONE.muted }}>
                {ch.rule_id} · {ch.status}
              </div>
              <div style={{ fontWeight: 600 }}>{ch.label}</div>
              <div style={{ fontSize: 14, color: "#4A5D66" }}>{ch.detail}</div>
            </div>
          ))}
        </section>
      )}

      {c && (
        <details style={{ marginTop: 16, fontSize: 13, color: TONE.muted }}>
          <summary>Values sent to the rules engine (from confirmed_json only)</summary>
          <pre style={{ background: "#fff", padding: 12, overflowX: "auto" }}>{JSON.stringify(c, null, 2)}</pre>
        </details>
      )}
    </main>
  );
}
