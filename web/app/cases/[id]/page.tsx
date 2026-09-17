import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, Check, ChevronRight, Plus, Sparkles, TriangleAlert } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CaseStatusBadge, DocStateBadge, VerdictBadge } from "../../components/badges";
import { Hint } from "../../components/hint";
import { PageHeader, TopBar } from "../../components/shell";
import { ProgressStepper } from "../../components/ui";
import type { CaseSummary } from "../../lib/case-status";
import { loadCaseSummary } from "../../lib/checks";
import { findDuplicateStudents, findSimilarCases } from "../../lib/similar";
import { caseLabel, fmtDate, fmtMonth, timeAgo } from "../../lib/format";
import { buildCase } from "../../lib/review";
import type { Case, Check as RuleCheck, DocType } from "../../types";
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
        { label: "Passport", value: c.passport_name || "—" },
        { label: "Transcript", value: c.transcript_name || "—" },
        ...(c.english_test_name ? [{ label: "English test", value: c.english_test_name }] : []),
      ];
    case "R2":
      return [
        { label: "Passport", value: d(c.passport_dob) },
        { label: "Transcript", value: d(c.transcript_dob) },
        ...(c.english_test_dob ? [{ label: "English test", value: d(c.english_test_dob) }] : []),
      ];
    case "R3":
      return [
        { label: "Transcript", value: d(c.transcript_grad_date) },
        { label: "Certificate", value: d(c.certificate_grad_date) },
      ];
    case "R4":
      return [
        { label: "Passport expiry", value: d(c.passport_expiry) },
        { label: "Course ends", value: d(c.course_end_date) },
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

/** A one-line, human title for the card. The rule's own label is the fallback. */
function headline(c: RuleCheck): string {
  if (c.status === "pending") return c.label;
  switch (c.rule_id) {
    case "R1":
      return c.verdict === "pass" ? "Name matches on every document" : c.verdict === "warn" ? "Name spelled differently on the transcript" : "Name differs from the passport";
    case "R2":
      return c.verdict === "pass" ? "Date of birth matches on every document" : c.detail.includes("543") ? "Date of birth off by exactly 543 years" : "Date of birth differs from the passport";
    case "R3":
      return c.verdict === "pass" ? "Graduation dates agree" : c.verdict === "warn" ? "Graduation dates are further apart than usual" : "Graduation dates do not agree";
    case "R4":
      return c.verdict === "pass" ? "Passport covers the end of the course" : c.verdict === "warn" ? "Passport has little buffer after the course" : "Passport expires before the course ends";
    case "R5":
      return c.verdict === "pass" ? "English test valid on the submission date" : c.verdict === "warn" ? "English test expires soon after submission" : "English test expires before submission";
    default:
      return c.label;
  }
}

/**
 * The engine's detail line in plain words: type tokens become names, ISO
 * dates become formatted ones. Null when the headline and the evidence
 * boxes already say everything the line would.
 */
function subline(c: RuleCheck): string | null {
  if (c.verdict === "pass" && c.status !== "pending") return null;
  if (c.verdict === "block" && (c.rule_id === "R1" || (c.rule_id === "R2" && !c.detail.includes("543")))) return null;
  const s = c.detail
    .replace(/\benglish_test\b/g, "English test")
    .replace(/\bdegree_certificate\b/g, "degree certificate")
    .replace(/\d{4}-\d{2}-\d{2}/g, (m) => fmtDate(m))
    .replace(/\.$/, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const STRIPE: Record<string, string> = {
  err: "border-l-2 border-l-(--error)",
  warn: "border-l-2 border-l-(--warning)",
  ok: "border-l-2 border-l-(--success)",
  "": "border-l-2 border-l-(--border-strong)",
};

function stripeFor(c: RuleCheck): string {
  if (c.status === "pending") return "";
  return c.verdict === "block" ? "err" : c.verdict === "warn" ? "warn" : "ok";
}

/** "institution: X; field: Y; english: Z" → "X · Y · Z". */
function profileSummary(profile: string): string {
  const kv: Record<string, string> = {};
  for (const part of profile.split(";")) {
    const i = part.indexOf(":");
    if (i > 0) kv[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return [kv.institution, kv.field ?? kv.qualification, kv.english].filter(Boolean).join(" · ") || profile;
}

function activity(s: CaseSummary): { at: string; text: string }[] {
  const ev: { at: string; text: string }[] = [];
  for (const slot of s.slots) {
    const d = slot.doc;
    if (!d) continue;
    ev.push({ at: d.created_at, text: `${slot.label} uploaded` });
    if (d.confirmed_json) ev.push({ at: d.confirmed_json.confirmed_at, text: `${slot.label} confirmed` });
    for (const r of d.requests) ev.push({ at: r.created_at, text: `${r.kind === "new_photo" ? "New photo" : "New document"} requested for ${slot.label.toLowerCase()}` });
  }
  for (const u of s.held) ev.push({ at: u.created_at, text: `${u.pages.length} page${u.pages.length === 1 ? "" : "s"} waiting to be classified` });
  for (const [, at] of Object.entries(s.meta.acknowledged)) ev.push({ at, text: "Warning confirmed by reviewer" });
  if (s.checks) ev.push({ at: new Date(s.checks.checked_at_ms).toISOString(), text: "Checks run" });
  return ev.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
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
  const firstUnreviewed = s.slots.find((x) => x.doc && x.state !== "reviewed")?.doc?.id;
  const firstOpen = s.held.length ? `${base}/classify` : firstUnreviewed ? `${base}/review/${firstUnreviewed}` : null;
  const allReviewed = s.held.length === 0 && s.slots.every((x) => x.state === "reviewed");
  const step: 3 | 4 = allReviewed ? 4 : 3;

  const checks = s.checks?.checks ?? [];
  const acked = (c: RuleCheck) => c.verdict === "warn" && c.rule_id in s.meta.acknowledged;
  const open = checks.filter((c) => c.status === "pending" || (c.verdict !== "pass" && !acked(c)));
  const settled = checks.filter((c) => !open.includes(c));
  const blocks = checks.filter((c) => c.verdict === "block");
  const missing = s.slots.filter((x) => x.state === "missing");
  const checkedAt = s.checks ? timeAgo(new Date(s.checks.checked_at_ms).toISOString()) : null;

  const primary =
    s.status === "blocked" ? (
      <a href="#verdict" className={cn(buttonVariants())}>
        View issue
      </a>
    ) : s.status === "pending_documents" ? (
      <Link href={`/cases/new?case_id=${encodeURIComponent(id)}`} className={cn(buttonVariants())}>
        Add documents
      </Link>
    ) : s.status === "needs_review" && firstOpen ? (
      <Link href={firstOpen} className={cn(buttonVariants())}>
        Continue review
      </Link>
    ) : (
      <a href="#checks" className={cn(buttonVariants())}>
        View checks
      </a>
    );

  const verdict: Record<CaseSummary["status"], { stripe: string; icon: typeof Ban; colour: string; title: string; line: string | null }> = {
    blocked: { stripe: "err", icon: Ban, colour: "text-(--error-text)", title: "Blocked", line: null },
    needs_review: { stripe: "warn", icon: TriangleAlert, colour: "text-(--warning-text)", title: "Needs review", line: null },
    pending_documents: { stripe: "", icon: TriangleAlert, colour: "text-foreground", title: "Waiting for documents", line: null },
    ready: { stripe: "ok", icon: Check, colour: "text-(--success-text)", title: "Ready to submit", line: "Every document is confirmed and every check passed." },
  };
  const v = verdict[s.status];
  const VerdictIcon = v.icon;
  const subtitle = [s.student.full ?? "Passport not yet confirmed", s.meta.intake ? `${fmtMonth(s.meta.intake)} intake` : null, s.meta.assignee].filter(Boolean).join(" · ");

  return (
    <>
      <TopBar
        crumbs={[{ label: "Cases", href: "/cases" }, { label: caseLabel(id) }]}
        actions={
          <>
            <Link href={`/assistant?case=${encodeURIComponent(id)}`} className={cn(buttonVariants({ variant: "outline" }))}>
              <Sparkles />
              Ask assistant
            </Link>
            {primary}
          </>
        }
      />
      <main className="content">
        {duplicates.length > 0 && (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-(--error) bg-(--error-soft) px-3 py-2 text-(--error-text)">
            <Ban className="size-4" />
            <span className="font-medium">
              Same student as {duplicates.length === 1 ? "case" : "cases"}{" "}
              {duplicates.map((d, i) => (
                <span key={d}>
                  {i > 0 && ", "}
                  <Link href={`/cases/${encodeURIComponent(d)}`} className="text-inherit underline underline-offset-2">
                    {caseLabel(d)}
                  </Link>
                </span>
              ))}
            </span>
            <span>· check before lodging twice</span>
            <Hint text="The confirmed passport name and date of birth match exactly. They were compared as a salted hash, never in the open." className="text-(--error-text)" />
          </div>
        )}
        <PageHeader
          display
          title={
            <span className="inline-flex items-center gap-3">
              Case {caseLabel(id)} <CaseStatusBadge status={s.status} />
            </span>
          }
          subtitle={subtitle}
          actions={<ProgressStepper current={step} caseId={id} />}
        />

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,64fr)_minmax(0,36fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <Card size="sm" className="gap-0 py-0">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <span className="text-base font-semibold">
                  Documents <span className="ml-1 text-sm font-normal text-muted-foreground">{s.reviewed} of {s.required} confirmed</span>
                </span>
                <Link href={`/cases/new?case_id=${encodeURIComponent(id)}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                  <Plus />
                  Add files
                </Link>
              </div>
              <Table>
                <TableBody>
                  {s.slots.map((slot) => {
                    const d = slot.doc;
                    const href = d ? `${base}/review/${d.id}` : slot.state === "unclassified" ? `${base}/classify` : `/cases/new?case_id=${encodeURIComponent(id)}`;
                    return (
                      <TableRow key={slot.type}>
                        <TableCell className="px-4 font-semibold">{slot.label}</TableCell>
                        <TableCell>
                          <DocStateBadge state={slot.state} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {d?.confirmed_json ? timeAgo(d.confirmed_json.confirmed_at) : d ? `${slot.fieldsLeft} of ${slot.fieldsTotal} fields left` : slot.held.length ? `${slot.held.reduce((n, u) => n + u.pages.length, 0)} page(s) held` : ""}
                        </TableCell>
                        <TableCell className="px-4 text-right">
                          {d && slot.state !== "reviewed" ? (
                            <Link href={href} className={cn(buttonVariants({ size: "sm" }))}>
                              Review
                            </Link>
                          ) : slot.state === "unclassified" ? (
                            <Link href={href} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                              Classify
                            </Link>
                          ) : d ? (
                            <Link href={href} className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))} aria-label={`Open ${slot.label}`}>
                              <ChevronRight />
                            </Link>
                          ) : (
                            <Link href={href} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                              Upload
                            </Link>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            <div className="flex flex-col gap-2.5" id="checks">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold">Checks</span>
                {checkedAt && <span className="text-xs text-muted-foreground">Checked {checkedAt}</span>}
              </div>
              {s.checksError && <div className="rounded-lg border border-(--error) bg-(--error-soft) px-3 py-2 text-(--error-text)">{s.checksError}. Checks could not run; the status above may be out of date.</div>}
              {!s.checks && !s.checksError && (
                <Card size="sm" className="border border-dashed ring-0">
                  <CardContent className="flex items-center gap-2">
                    <VerdictBadge verdict="warn" status="pending" />
                    <span className="font-semibold">Not run yet</span>
                    <Hint text="Checks run automatically once a document is fully confirmed. They read confirmed values only." />
                  </CardContent>
                </Card>
              )}
              {open.map((c) => {
                const ev = c.status === "pending" ? [] : evidence(c.rule_id, caseValues);
                const line = subline(c);
                return (
                  <Card key={c.rule_id} id={`check-${c.rule_id}`} size="sm" className={cn("gap-2", STRIPE[stripeFor(c)])}>
                    <CardContent className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <VerdictBadge verdict={c.verdict} status={c.status} />
                        <span className="font-semibold">{headline(c)}</span>
                      </div>
                      {line && <div className="text-xs text-(--text-2)">{line}</div>}
                      {ev.length > 0 && (
                        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(ev.length, 3)}, minmax(0, 1fr))` }}>
                          {ev.map((e, i) => (
                            <div key={e.label} className="min-w-0 rounded-md border bg-card px-2.5 py-1.5 break-words">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                {e.label}
                                {(c.rule_id === "R1" || c.rule_id === "R2") && i === 0 && <Hint text="The passport is authoritative. Other documents are reissued to match it, never edited." />}
                              </div>
                              <div className="font-semibold tabular-nums">{e.value}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {c.status !== "pending" && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <CheckActions caseId={id} check={c} acknowledged={false} docIdByType={docIdByType} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {settled.length > 0 && (
                <Collapsible>
                  <Card size="sm" className={cn("gap-0", STRIPE.ok)}>
                    <CardContent>
                      <CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-2 text-left text-sm font-medium">
                        <ChevronRight className="size-4 text-muted-foreground transition-transform group-data-panel-open:rotate-90" />
                        {settled.length} check{settled.length === 1 ? "" : "s"} passed
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-3 flex flex-col gap-2 pl-6">
                          {settled.map((c) => (
                            <div key={c.rule_id} id={`check-${c.rule_id}`} className="flex flex-wrap items-center gap-2 text-sm">
                              <Check className="size-4 text-(--success)" />
                              <span>{headline(c)}</span>
                              {acked(c) && (
                                <>
                                  <span className="text-muted-foreground">· confirmed by reviewer</span>
                                  <CheckActions caseId={id} check={c} acknowledged docIdByType={docIdByType} />
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </CardContent>
                  </Card>
                </Collapsible>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 xl:sticky xl:top-[calc(var(--topbar-h)+24px)]">
            <Card id="verdict" className={cn("gap-3", STRIPE[v.stripe])}>
              <CardContent className="flex flex-col">
                <div className={cn("flex items-center gap-2 text-lg font-semibold", v.colour)}>
                  <VerdictIcon className="size-5" />
                  {v.title}
                </div>
                {v.line && <div className="mt-1.5 text-(--text-2)">{v.line}</div>}
                {blocks.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {blocks.map((b) => (
                      <li key={b.rule_id} className="flex items-start gap-2">
                        <Ban className="mt-0.5 size-3.5 shrink-0 text-(--error)" />
                        <a href={`#check-${b.rule_id}`} className="font-semibold text-(--error-text) hover:underline">
                          {headline(b)}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {s.openItems.length > 0 && (
                  <>
                    {blocks.length > 0 && <div className="mt-4 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Also outstanding</div>}
                    <ul className="mt-2 flex flex-col gap-1 text-xs text-(--warning-text)">
                      {s.openItems.map((it) => (
                        <li key={it} className="flex items-start gap-2">
                          <TriangleAlert className="mt-px size-3.5 shrink-0" />
                          {it}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {s.status === "needs_review" && firstOpen && (
                  <Link href={firstOpen} className={cn(buttonVariants(), "mt-4")}>
                    Continue review
                  </Link>
                )}
                {s.status === "pending_documents" && (
                  <Link href={`/cases/new?case_id=${encodeURIComponent(id)}`} className={cn(buttonVariants(), "mt-4")}>
                    Add {missing.length === 1 ? missing[0].label.toLowerCase() : "documents"}
                  </Link>
                )}
              </CardContent>
            </Card>

            <CaseDetailsCard meta={s.meta} />

            <Card size="sm">
              <CardHeader>
                <CardTitle>Similar cases</CardTitle>
              </CardHeader>
              <CardContent>
                {similar.length === 0 ? (
                  <div className="text-xs text-muted-foreground">None yet</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {similar.map((x) => (
                      <div key={x.case_id}>
                        <div className="flex items-center justify-between">
                          <Link href={`/cases/${encodeURIComponent(x.case_id)}`} className="font-mono text-[12.5px] font-semibold text-primary hover:underline">
                            {caseLabel(x.case_id)}
                          </Link>
                          <span className="font-mono text-[12.5px] text-muted-foreground">{Math.round(x.similarity * 100)}%</span>
                        </div>
                        <div className="text-xs text-(--text-2)">{profileSummary(x.profile)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5 text-[13px]">
                {activity(s).map((e) => (
                  <div key={`${e.at}:${e.text}`}>
                    <span className="text-muted-foreground">{timeAgo(e.at)}</span> · {e.text}
                  </div>
                ))}
                {activity(s).length === 0 && <span className="text-muted-foreground">Nothing yet</span>}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}
