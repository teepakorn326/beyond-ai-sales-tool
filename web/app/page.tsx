import type { CheckResult } from "./types";

const TONE: Record<string, string> = {
  pass: "#2F6B4F",
  warn: "#9C6410",
  block: "#933731",
};

async function runCheck(): Promise<CheckResult | null> {
  const base = process.env.EXTRACTOR_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${base}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(DEMO_CASE),
      cache: "no-store",
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const DEMO_CASE = {
  case_id: "STU-2026-0413",
  passport_name: "SUWANNA JAROENSUK",
  passport_dob: "2004-03-14",
  passport_expiry: "2029-11-02",
  transcript_name: "SUVANNA JAROENSUK",
  transcript_dob: "2004-03-14",
  english_test_date: "2024-04-20",
  course_end_date: "2029-06-30",
  submission_target: "2026-10-31",
};

export default async function Page() {
  const result = await runCheck();

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 20 }}>ตรวจเอกสารก่อนยื่น</h1>

      {!result && (
        <p style={{ color: "#933731" }}>
          rules service ไม่ตอบ — รัน <code>docker compose up</code> ก่อน
        </p>
      )}

      {result && (
        <>
          <p style={{ color: result.can_proceed ? TONE.pass : TONE.block }}>
            {result.can_proceed ? "ตรวจผ่านครบทุกข้อ" : "ยังยื่นไม่ได้"}
            <span style={{ color: "#7C8D95", marginLeft: 8, fontSize: 13 }}>
              {result.ruleset_version}
            </span>
          </p>

          {result.checks.map((c) => (
            <div
              key={c.rule_id}
              style={{
                borderLeft: `3px solid ${TONE[c.verdict]}`,
                padding: "10px 14px",
                marginBottom: 8,
                background: "#fff",
              }}
            >
              <div style={{ fontSize: 12, color: "#7C8D95" }}>
                {c.rule_id} · {c.status}
              </div>
              <div style={{ fontWeight: 600 }}>{c.label}</div>
              <div style={{ fontSize: 14, color: "#4A5D66" }}>{c.detail}</div>
            </div>
          ))}
        </>
      )}
    </main>
  );
}
