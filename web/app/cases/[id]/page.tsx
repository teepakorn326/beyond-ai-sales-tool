import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CaseStatusBadge, DocStateBadge, ProgressSegments, VerdictBadge } from "../../components/badges";
import { Icon } from "../../components/icons";
import { PageHeader, TopBar } from "../../components/shell";
import { ProgressStepper } from "../../components/ui";
import type { CaseSummary } from "../../lib/case-status";
import { loadCaseSummary } from "../../lib/checks";
import { findDuplicateStudents, findSimilarCases } from "../../lib/similar";
import { caseLabel, fmtDate, fmtDateTime, fmtMonth, timeAgo } from "../../lib/format";
import { buildCase, DOC_TYPE_LABELS } from "../../lib/review";
import type { Case, Check, DocType } from "../../types";
import { CaseDetailsCard, CheckActions } from "./case-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Case ${caseLabel(id)}` };
}

/** The two values a rule compared, from confirmed data only. Display, not decision. */
function evidence(rule: string, c: Case): { label: string; value: string }[] {
  const d = (v: string | null) => (v ? fmtDate(v) : "—");
  switch (rule) {
    case "R1":
      return [
        { label: "Passport · authoritative", value: c.passport_name || "—" },
        { label: "Transcript", value: c.transcript_name || "—" },
        ...(c.english_test_name ? [{ label: "English test", value: c.english_test_name }] : []),
      ];
    case "R2":
      return [
        { label: "Passport · authoritative", value: d(c.passport_dob) },
        { label: "Transcript", value: d(c.transcript_dob) },
        ...(c.english_test_dob ? [{ label: "English test", value: d(c.english_test_dob) }] : []),
      ];
    case "R3":
      return [
        { label: "Transcript · graduated", value: d(c.transcript_grad_date) },
        { label: "Certificate · conferred", value: d(c.certificate_grad_date) },
      ];
    case "R4":
      return [
        { label: "Passport expiry", value: d(c.passport_expiry) },
        { label: "Course end date", value: d(c.course_end_date) },
      ];
    case "R5":
      return [
        { label: "Test date", value: d(c.english_test_date) },
        { label: "Submission target", value: d(c.submission_target) },
      ];
    default:
      return [];
  }
}

const RULE_DOCS: Record<string, DocType[]> = {
  R1: ["passport", "transcript", "english_test"],
  R2: ["passport", "transcript", "english_test"],
  R3: ["transcript", "degree_certificate"],
  R4: ["passport"],
  R5: ["english_test"],
};

/** A one-line, human title for the card. The rule's own label is the fallback. */
function headline(c: Check): string {
  if (c.status === "pending") return c.label;
  switch (c.rule_id) {
    case "R1":
      return c.verdict === "pass" ? "Name matches on every document" : c.verdict === "warn" ? "Name variation detected" : "Name differs from the passport";
    case "R2":
      return c.verdict === "pass" ? "Date of birth matches on every document" : c.detail.includes("543") ? "Date of birth differs by exactly 543 years" : "Date of birth differs from the passport";
    case "R3":
      return c.verdict === "pass" ? "Graduation dates agree" : c.verdict === "warn" ? "Graduation dates are further apart than usual" : "Graduation dates do not agree";
    case "R4":
      return c.verdict === "pass" ? "Passport covers the end of the course" : c.verdict === "warn" ? "Passport has little buffer after the course" : "Passport expires before the course ends";
    case "R5":
      return c.verdict === "pass" ? "English test still valid on the submission date" : c.verdict === "warn" ? "English test expires soon after the submission date" : "English test expires before the submission target";
    default:
      return c.label;
  }
}

function stripeFor(c: Check): string {
  if (c.status === "pending") return "";
  return c.verdict === "block" ? "err" : c.verdict === "warn" ? "warn" : "ok";
}

function activity(s: CaseSummary): { at: string; text: string }[] {
  const ev: { at: string; text: string }[] = [];
  for (const slot of s.slots) {
    const d = slot.doc;
    if (!d) continue;
    ev.push({ at: d.created_at, text: `${slot.label} uploaded and read${d.classification ? ` (${d.classification.confidence} confidence)` : ""}` });
    if (d.confirmed_json) ev.push({ at: d.confirmed_json.confirmed_at, text: `${slot.label} fully confirmed` });
    for (const r of d.requests) ev.push({ at: r.created_at, text: `${r.kind === "new_photo" ? "New photo" : "New document"} requested for ${slot.label.toLowerCase()}` });
  }
  for (const u of s.held) ev.push({ at: u.created_at, text: `${u.pages.length} page${u.pages.length === 1 ? "" : "s"} held for a person to classify` });
  for (const [rule, at] of Object.entries(s.meta.acknowledged)) ev.push({ at, text: `${rule} warning confirmed by a reviewer` });
  if (s.checks) ev.push({ at: new Date(s.checks.checked_at_ms).toISOString(), text: `Checks run (${s.checks.ruleset_version})` });
  return ev.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
}

export default async function CaseOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await loadCaseSummary(id);
  if (!s) notFound();
  const [similar, duplicates] = await Promise.all([findSimilarCases(id).catch(() => []), findDuplicateStudents(id).catch(() => [])]);

  const base = `/cases/${encodeURIComponent(id)}`;
  const docs = s.slots.filter((x) => x.doc).map((x) => x.doc!);
  const caseValues = buildCase(docs, id, s.meta.course_end_date, s.meta.submission_target);
  const docIdByType = Object.fromEntries(s.slots.filter((x) => x.doc).map((x) => [x.type, x.doc!.id])) as Partial<Record<DocType, string>>;
  const firstOpen = s.held.length ? `${base}/classify` : s.slots.find((x) => x.doc && x.state !== "reviewed")?.doc?.id ? `${base}/review/${s.slots.find((x) => x.doc && x.state !== "reviewed")!.doc!.id}` : null;
  const allReviewed = s.held.length === 0 && s.slots.every((x) => x.state === "reviewed");
  const step: 3 | 4 = allReviewed ? 4 : 3;

  const checks = s.checks?.checks ?? [];
  const blocks = checks.filter((c) => c.verdict === "block");
  const warns = checks.filter((c) => c.verdict === "warn" && c.status !== "pending" && !(c.rule_id in s.meta.acknowledged));
  const pendings = checks.filter((c) => c.status === "pending");

  const primary =
    s.status === "blocked" ? (
      <a href="#verdict" className="btn primary">
        View issue
      </a>
    ) : s.status === "pending_documents" ? (
      <Link href={`/cases/new?case_id=${encodeURIComponent(id)}`} className="btn primary">
        Add documents
      </Link>
    ) : s.status === "needs_review" && firstOpen ? (
      <Link href={firstOpen} className="btn primary">
        Continue review
      </Link>
    ) : (
      <a href="#checks" className="btn primary">
        View checks
      </a>
    );

  const verdictTone = s.status === "blocked" ? "err" : s.status === "ready" ? "ok" : s.status === "pending_documents" ? "" : "warn";
  const verdictText: Record<CaseSummary["status"], { title: string; body: string }> = {
    blocked: { title: "Blocked", body: `${blocks.length} blocking issue${blocks.length === 1 ? "" : "s"} must be resolved before this case can be submitted.` },
    needs_review: { title: "Needs review", body: `${s.openItems.length} item${s.openItems.length === 1 ? "" : "s"} require${s.openItems.length === 1 ? "s" : ""} confirmation before validation can continue.` },
    pending_documents: { title: "Pending documents", body: `${s.slots.filter((x) => x.state === "missing").length} required document${s.slots.filter((x) => x.state === "missing").length === 1 ? " has" : "s have"} not been received.` },
    ready: { title: "Ready to submit", body: "All required documents have been reviewed and every blocking check passed." },
  };

  return (
    <>
      <TopBar
        crumbs={[{ label: "Cases", href: "/cases" }, { label: caseLabel(id) }]}
        actions={
          <>
            <Link href={`/assistant?case=${encodeURIComponent(id)}`} className="btn secondary">
              <Icon name="spark" size={14} />
              Ask assistant
            </Link>
            {s.status === "blocked" && firstOpen && (
              <Link href={firstOpen} className="btn secondary">
                Continue review
              </Link>
            )}
            {primary}
          </>
        }
      />
      <main className="content">
        {duplicates.length > 0 && (
          <div className="alert" role="alert">
            <div className="row" style={{ gap: 8 }}>
              <Icon name="block" size={16} />
              <b>Same student as {duplicates.length === 1 ? "case" : "cases"} {duplicates.map((d, i) => (
                <span key={d}>
                  {i > 0 && ", "}
                  <Link href={`/cases/${encodeURIComponent(d)}`} style={{ color: "inherit", textDecoration: "underline" }}>
                    {caseLabel(d)}
                  </Link>
                </span>
              ))}.</b>
            </div>
            <div className="small" style={{ marginTop: 4 }}>
              The confirmed passport surname, given name and date of birth match exactly. They were compared as a salted hash, never in the open. Check before lodging twice.
            </div>
          </div>
        )}
        <PageHeader
          display
          title={
            <span className="row" style={{ gap: 12 }}>
              Case {caseLabel(id)} <CaseStatusBadge status={s.status} />
            </span>
          }
          subtitle={
            <>
              {s.student.full ?? <span className="muted">Passport not yet confirmed</span>} · {s.meta.intake ? `${fmtMonth(s.meta.intake)} intake` : "No intake set"} · Submission target {fmtDate(s.meta.submission_target)}
              {s.meta.assignee ? ` · Assigned to ${s.meta.assignee}` : " · Unassigned"}
            </>
          }
          actions={<ProgressStepper current={step} caseId={id} />}
        />

        <div className="split-overview">
          <div className="stack" style={{ gap: 24, minWidth: 0 }}>
            <div className="grid-3">
              <div className={`card compact${s.uploaded < s.required ? " stripe" : ""}`}>
                <div className="label">Documents</div>
                <div className="value" style={{ fontSize: 15, marginTop: 2 }}>
                  {s.uploaded} / {s.required} received
                </div>
                <div style={{ marginTop: 6 }}>
                  <ProgressSegments filled={s.uploaded} total={s.required} />
                </div>
              </div>
              <div className={`card compact${s.reviewed < s.required ? " stripe warn" : " stripe ok"}`}>
                <div className="label">Review</div>
                <div className="value" style={{ fontSize: 15, marginTop: 2 }}>
                  {s.reviewed} / {s.required} confirmed
                </div>
                <div style={{ marginTop: 6 }}>
                  <ProgressSegments filled={s.reviewed} total={s.required} />
                </div>
              </div>
              <div className={`card compact${blocks.length ? " stripe err" : warns.length || pendings.length ? " stripe warn" : s.checks ? " stripe ok" : ""}`}>
                <div className="label">Checks</div>
                <div className="value" style={{ fontSize: 15, marginTop: 2 }}>
                  {s.checks ? [blocks.length && `${blocks.length} blocked`, warns.length && `${warns.length} warning`, pendings.length && `${pendings.length} pending`].filter(Boolean).join(" · ") || "All passed" : "Not run yet"}
                </div>
                <div className="muted small" style={{ marginTop: 6 }}>
                  {s.checksError ? <span style={{ color: "var(--error-text)" }}>{s.checksError}</span> : s.checks ? `Ruleset ${s.checks.ruleset_version} · ${timeAgo(new Date(s.checks.checked_at_ms).toISOString())}` : "Runs once a document is fully confirmed"}
                </div>
              </div>
            </div>

            <div className="tbl">
              <div className="row" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", justifyContent: "space-between" }}>
                <span className="h2">Documents</span>
                <Link href={`/cases/new?case_id=${encodeURIComponent(id)}`} className="btn ghost sm">
                  <Icon name="plus" size={14} />
                  Add files
                </Link>
              </div>
              <div className="tbl-scroll">
                <table>
                  <tbody>
                    {s.slots.map((slot) => {
                      const d = slot.doc;
                      const href = d ? `${base}/review/${d.id}` : slot.state === "unclassified" ? `${base}/classify` : `/cases/new?case_id=${encodeURIComponent(id)}`;
                      return (
                        <tr key={slot.type}>
                          <td className="value">{slot.label}</td>
                          <td className="muted">{d ? `${d.page_count} page${d.page_count === 1 ? "" : "s"}` : slot.held.length ? `${slot.held.reduce((n, u) => n + u.pages.length, 0)} page(s) held` : "—"}</td>
                          <td>
                            <DocStateBadge state={slot.state} />
                          </td>
                          <td className="muted">
                            {d?.confirmed_json ? `Confirmed ${timeAgo(d.confirmed_json.confirmed_at)}` : d ? `${slot.fieldsLeft} of ${slot.fieldsTotal} fields left` : slot.state === "unclassified" ? "Type needs confirming" : "Not received"}
                          </td>
                          <td className="right">
                            {d && slot.state !== "reviewed" ? (
                              <Link href={href} className="btn primary sm">
                                Review
                              </Link>
                            ) : slot.state === "unclassified" ? (
                              <Link href={href} className="btn secondary sm">
                                Classify
                              </Link>
                            ) : d ? (
                              <Link href={href} className="btn ghost sm" aria-label={`Open ${slot.label}`}>
                                <Icon name="chev" size={14} />
                              </Link>
                            ) : (
                              <Link href={href} className="btn secondary sm">
                                Upload
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="stack" style={{ gap: 10 }} id="checks">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="h2">Consistency checks</span>
                <span className="muted mono">{s.checks ? `${s.checks.ruleset_version} · last run ${timeAgo(new Date(s.checks.checked_at_ms).toISOString())}` : "Rules run on confirmed data only"}</span>
              </div>
              {s.checksError && <div className="alert">{s.checksError}. Checks could not be run; the status above may be out of date.</div>}
              {!s.checks && !s.checksError && (
                <div className="card compact" style={{ borderStyle: "dashed" }}>
                  <div className="row">
                    <VerdictBadge verdict="warn" status="pending" />
                    <span className="value">Checks have not run yet</span>
                  </div>
                  <div className="t2" style={{ marginTop: 4 }}>
                    The rules engine reads confirmed data only. Confirm at least one document and the five checks run automatically.
                  </div>
                </div>
              )}
              {checks.map((c) => {
                const acked = c.verdict === "warn" && c.rule_id in s.meta.acknowledged;
                const ev = c.status === "pending" ? [] : evidence(c.rule_id, caseValues);
                return (
                  <div key={c.rule_id} id={`check-${c.rule_id}`} className={`card compact stripe ${acked ? "ok" : stripeFor(c)}`}>
                    <div className="row wrap">
                      {acked ? (
                        <span className="pill ok">
                          <Icon name="check" size={12} />
                          Confirmed by reviewer
                        </span>
                      ) : (
                        <VerdictBadge verdict={c.verdict} status={c.status} />
                      )}
                      <span className="value">{headline(c)}</span>
                    </div>
                    <div className="t2" style={{ marginTop: 4 }}>
                      {c.status === "pending" ? `Waiting: ${c.detail}.` : c.detail.charAt(0).toUpperCase() + c.detail.slice(1) + (c.detail.endsWith(".") ? "" : ".")}
                      {acked && ` A reviewer confirmed this on ${fmtDateTime(s.meta.acknowledged[c.rule_id])}.`}
                    </div>
                    {ev.length > 0 && (
                      <div className="pair" style={{ gridTemplateColumns: `repeat(${Math.min(ev.length, 3)}, minmax(0, 1fr))` }}>
                        {ev.map((e) => (
                          <div key={e.label} className="box">
                            <div className="label">{e.label}</div>
                            <div className="value">{e.value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="row wrap" style={{ marginTop: 10 }}>
                      <CheckActions caseId={id} check={c} acknowledged={acked} docIdByType={docIdByType} />
                      <span className="spacer" />
                      <span className="mono muted">
                        {c.rule_id} · {(RULE_DOCS[c.rule_id] ?? []).map((t) => DOC_TYPE_LABELS[t]).join(", ")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="verdict-col">
            <div id="verdict" className={`card${verdictTone ? ` stripe ${verdictTone}` : " stripe"}`}>
              <div className="overline">Case verdict</div>
              <div className="row" style={{ gap: 8, marginTop: 6 }}>
                <span style={{ color: s.status === "blocked" ? "var(--error)" : s.status === "ready" ? "var(--success)" : s.status === "needs_review" ? "var(--warning)" : "var(--muted)" }}>
                  <Icon name={s.status === "blocked" ? "block" : s.status === "ready" ? "check" : s.status === "needs_review" ? "tri" : "pending"} size={20} />
                </span>
                <span style={{ fontSize: 18, fontWeight: 600, color: s.status === "blocked" ? "var(--error-text)" : s.status === "ready" ? "var(--success-text)" : s.status === "needs_review" ? "var(--warning-text)" : "var(--text)" }}>{verdictText[s.status].title}</span>
              </div>
              <div className="t2" style={{ margin: "6px 0 12px" }}>{verdictText[s.status].body}</div>
              {blocks.map((b) => (
                <div key={b.rule_id} className="field" style={{ marginBottom: 8 }}>
                  <div className="value">{headline(b)}</div>
                  <div className="muted small" style={{ marginTop: 2 }}>{b.detail.charAt(0).toUpperCase() + b.detail.slice(1)}.</div>
                  <a href={`#check-${b.rule_id}`} className="btn primary sm" style={{ marginTop: 10 }}>
                    View issue
                  </a>
                </div>
              ))}
              {s.status === "needs_review" && firstOpen && (
                <Link href={firstOpen} className="btn primary">
                  Continue review
                </Link>
              )}
              {s.status === "pending_documents" && (
                <Link href={`/cases/new?case_id=${encodeURIComponent(id)}`} className="btn primary">
                  Add documents
                </Link>
              )}
              {s.openItems.length > 0 && (s.status === "blocked" || s.status === "pending_documents") && (
                <>
                  <div className="overline" style={{ marginTop: 16 }}>
                    Also outstanding
                  </div>
                  <ul className="stack small" style={{ gap: 4, marginTop: 6, paddingLeft: 0, listStyle: "none" }}>
                    {s.openItems.map((it) => (
                      <li key={it} className="row" style={{ color: "var(--warning-text)" }}>
                        <Icon name="tri" size={13} />
                        {it}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {s.status === "needs_review" && s.openItems.length > 0 && (
                <ul className="stack small" style={{ gap: 4, marginTop: 12, paddingLeft: 0, listStyle: "none" }}>
                  {s.openItems.map((it) => (
                    <li key={it} className="row" style={{ color: "var(--warning-text)" }}>
                      <Icon name="tri" size={13} />
                      {it}
                    </li>
                  ))}
                </ul>
              )}
              {s.checks && (
                <div className="muted small" style={{ marginTop: 12 }}>
                  Ruleset {s.checks.ruleset_version} · checked {timeAgo(new Date(s.checks.checked_at_ms).toISOString())}
                </div>
              )}
            </div>

            <CaseDetailsCard meta={s.meta} />

            <div className="card">
              <div className="overline">Similar cases</div>
              {similar.length === 0 ? (
                <div className="muted small" style={{ marginTop: 6 }}>
                  No similar cases yet. Profiles are built from confirmed institution, qualification, field, destination, intake and English band only.
                </div>
              ) : (
                <div className="stack" style={{ gap: 10, marginTop: 8 }}>
                  {similar.map((x) => (
                    <div key={x.case_id}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <Link href={`/cases/${encodeURIComponent(x.case_id)}`} className="value mono">
                          {caseLabel(x.case_id)}
                        </Link>
                        <span className="mono muted">{Math.round(x.similarity * 100)}%</span>
                      </div>
                      <div className="t2 small" style={{ overflowWrap: "anywhere" }}>{x.profile}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="overline">Activity</div>
              <div className="activity">
                {activity(s).map((e) => (
                  <div key={`${e.at}:${e.text}`}>
                    <span className="muted">{timeAgo(e.at)}</span> · {e.text}
                  </div>
                ))}
                {activity(s).length === 0 && <span className="muted">Nothing yet.</span>}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
