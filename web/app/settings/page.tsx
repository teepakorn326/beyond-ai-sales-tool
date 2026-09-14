import type { Metadata } from "next";

import { PageHeader, TopBar } from "../components/shell";

export const metadata: Metadata = { title: "Settings" };

// Mirrors rules.DefaultConfig() in rules/rules.go. The rules engine owns
// these; this page shows staff what the checks are measuring against.
const THRESHOLDS = [
  { rule: "R3", name: "Graduation date agrees", key: "grad_date_pass_days", value: "180 days", note: "Certificate dated within this many days after the transcript passes. In Thailand completion and conferral are routinely months apart." },
  { rule: "R3", name: "Graduation date agrees", key: "grad_date_warn_days", value: "365 days", note: "Beyond the pass window but within this is a warning; beyond it, blocked." },
  { rule: "R4", name: "Passport covers the course", key: "passport_buffer_months", value: "6 months", note: "Passport must outlast the course end date by this much; less is a warning, expiring before the course ends is blocked." },
  { rule: "R5", name: "English test still valid", key: "english_valid_years", value: "2 years", note: "Validity from the test date. Expiry is computed by the rules engine, never stored on the document." },
  { rule: "R5", name: "English test still valid", key: "english_warn_days", value: "60 days", note: "Valid but expiring within this many days of the submission target is a warning." },
];

export default function SettingsPage() {
  return (
    <>
      <TopBar crumbs={[{ label: "Settings" }]} />
      <main className="content">
        <PageHeader title="Settings" subtitle="Thresholds the consistency checks use, and where this instance keeps its data." />
        <div className="tbl">
          <div className="row" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <span className="h2">Rule thresholds</span>
            <span className="muted small" style={{ marginLeft: 8 }}>
              Read-only here. Configured in the rules service (<span className="mono">rules.Config</span>), so the business can tune them without a code change and the eval suite can show what each costs.
            </span>
          </div>
          <div className="tbl-scroll">
            <table>
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Check</th>
                  <th>Setting</th>
                  <th>Value</th>
                  <th>What it means</th>
                </tr>
              </thead>
              <tbody>
                {THRESHOLDS.map((t) => (
                  <tr key={t.key}>
                    <td className="mono muted">{t.rule}</td>
                    <td className="value">{t.name}</td>
                    <td className="mono">{t.key}</td>
                    <td className="tnum">{t.value}</td>
                    <td className="t2" style={{ height: "auto", padding: "10px 12px" }}>{t.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="grid-2">
          <div className="card compact">
            <div className="overline">Storage</div>
            <div className="t2" style={{ marginTop: 4 }}>
              Records live in Postgres (<span className="mono">DATABASE_URL</span>); page images in the private S3 bucket <span className="mono">{process.env.S3_BUCKET ?? "S3_BUCKET not set"}</span> under opaque keys, streamed through the app with <span className="mono">Cache-Control: private, no-store</span>. Passport and report numbers are recorded as present or absent, never stored. Similar-case profiles contain no names, dates of birth or numbers; duplicate detection compares a salted hash.
            </div>
          </div>
          <div className="card compact">
            <div className="overline">Who can do what</div>
            <div className="t2" style={{ marginTop: 4 }}>
              There is no sign-in in this build: every session is a reviewer. Approvals of assistant actions are recorded in the audit log under the CLI actor. Add authentication before exposing this beyond the office network.
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
