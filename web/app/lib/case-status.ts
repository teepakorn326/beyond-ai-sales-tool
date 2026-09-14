// Pure derivation of what a case looks like to staff: its status, which
// documents exist and in what state, what a person still has to do. No I/O,
// so every branch is testable by calling a function.
//
// Status is never typed by hand. It is computed in a fixed priority so the
// header always names the thing that most needs doing:
//   blocked > pending documents > needs review > ready

import { DOC_TYPES, type CheckResult, type Confidence, type DocType, type ReviewDocument, type UploadRecord } from "../types";
import { DOC_TYPE_LABELS, fieldViews, requiredFields } from "./review";

export type CaseStatus = "blocked" | "pending_documents" | "needs_review" | "ready";
export type DocState = "reviewed" | "needs_review" | "unclassified" | "requested" | "missing";

/** What the web tier stores per case. Superset of what the agent reads from cases.json. */
export interface CaseMeta {
  case_id: string;
  country: "AU" | "NZ";
  course_end_date: string | null;
  submission_target: string | null;
  program_id: string | null;
  status: "open" | "archived";
  /** "YYYY-MM" */
  intake: string | null;
  assignee: string | null;
  /** Rule warnings a person has looked at and confirmed, by rule id → ISO time. */
  acknowledged: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface DocSlot {
  type: DocType;
  label: string;
  doc: ReviewDocument | null;
  state: DocState;
  fieldsLeft: number;
  fieldsTotal: number;
  /** Held uploads the sorter guessed as this type. */
  held: UploadRecord[];
}

export interface CaseSummary {
  case_id: string;
  meta: CaseMeta;
  status: CaseStatus;
  slots: DocSlot[];
  /** Held uploads whose type is unknown or low-confidence, any type. */
  held: UploadRecord[];
  uploaded: number;
  reviewed: number;
  required: number;
  student: { full: string | null; short: string | null };
  checks: CheckResult | null;
  checksError: string | null;
  lastUpdated: string;
  /** Things a person must still do before the case can be ready. */
  openItems: string[];
}

export const REQUIRED_TYPES: readonly DocType[] = DOC_TYPES;

/** The newest non-superseded document of each type. */
export function latestByType(docs: readonly ReviewDocument[]): Map<DocType, ReviewDocument> {
  const m = new Map<DocType, ReviewDocument>();
  for (const d of [...docs].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (d.superseded_by) continue;
    if (!m.has(d.doc_type)) m.set(d.doc_type, d);
  }
  return m;
}

export function fieldsProgress(doc: ReviewDocument): { done: number; total: number } {
  const required = requiredFields(doc.extracted_json);
  const done = required.filter((n) => n in doc.confirmations).length;
  return { done, total: required.length };
}

export function docState(doc: ReviewDocument): DocState {
  if (doc.confirmed_json) return "reviewed";
  if (doc.requests.length > 0) return "requested";
  return "needs_review";
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, p, c: string) => p + c.toUpperCase());
}

/**
 * Only a confirmed passport names the student. Extracted-but-unconfirmed
 * values are not shown on list screens: they may be wrong, and they are
 * personal data the overview does not need.
 */
export function studentName(docs: readonly ReviewDocument[]): { full: string | null; short: string | null } {
  const p = latestByType(docs).get("passport");
  const c = p?.confirmed_json?.fields;
  const given = typeof c?.given_name_latin === "string" ? c.given_name_latin.trim() : "";
  const surname = typeof c?.surname_latin === "string" ? c.surname_latin.trim() : "";
  if (!given && !surname) return { full: null, short: null };
  const full = [given, surname].filter(Boolean).join(" ");
  const short = surname ? `${given ? given[0].toUpperCase() + ". " : ""}${titleCase(surname)}` : titleCase(given);
  return { full, short };
}

export function summarize(
  caseId: string,
  meta: CaseMeta,
  docs: readonly ReviewDocument[],
  uploads: readonly UploadRecord[],
  checks: CheckResult | null,
  checksError: string | null,
): CaseSummary {
  const latest = latestByType(docs);
  const heldAll = uploads.filter((u) => u.case_id === caseId && u.status === "held");

  const slots: DocSlot[] = REQUIRED_TYPES.map((type) => {
    const doc = latest.get(type) ?? null;
    const held = heldAll.filter((u) => u.suggested_type === type);
    let state: DocState;
    let fieldsLeft = 0;
    let fieldsTotal = 0;
    if (doc) {
      state = docState(doc);
      const p = fieldsProgress(doc);
      fieldsLeft = p.total - p.done;
      fieldsTotal = p.total;
    } else if (held.length) state = "unclassified";
    else state = "missing";
    return { type, label: DOC_TYPE_LABELS[type], doc, state, fieldsLeft, fieldsTotal, held };
  });

  const uploaded = slots.filter((s) => s.state !== "missing").length + (heldAll.some((u) => u.suggested_type === "other") ? 0 : 0);
  const reviewed = slots.filter((s) => s.state === "reviewed").length;
  const missing = slots.filter((s) => s.state === "missing");

  const openItems: string[] = [];
  for (const u of heldAll) openItems.push(`Confirm the type of ${u.pages.map((p) => p.filename).join(" + ")}`);
  for (const s of slots) {
    if (s.doc && s.state !== "reviewed") openItems.push(`${s.label}: ${s.fieldsLeft} field${s.fieldsLeft === 1 ? "" : "s"} to confirm`);
  }
  for (const s of missing) openItems.push(`${s.label} not received`);
  const warns = checks?.checks.filter((c) => c.verdict === "warn" && c.status !== "pending" && !(c.rule_id in meta.acknowledged)) ?? [];
  for (const w of warns) openItems.push(`${w.label} (${w.rule_id}) needs a person to confirm`);

  const blocked = checks?.checks.some((c) => c.verdict === "block") ?? false;
  let status: CaseStatus;
  if (blocked) status = "blocked";
  else if (missing.length > 0) status = "pending_documents";
  else if (heldAll.length > 0 || slots.some((s) => s.doc && s.state !== "reviewed") || warns.length > 0) status = "needs_review";
  else if (checks?.can_proceed) status = "ready";
  else status = "needs_review"; // checks pending or unavailable: never "ready" on a guess

  const stamps = [
    meta.updated_at,
    ...docs.map((d) => d.created_at),
    ...docs.map((d) => d.confirmed_json?.confirmed_at ?? ""),
    ...docs.flatMap((d) => d.requests.map((r) => r.created_at)),
    ...uploads.filter((u) => u.case_id === caseId).map((u) => u.created_at),
  ].filter(Boolean);
  const lastUpdated = stamps.sort().at(-1) ?? meta.created_at;

  return {
    case_id: caseId,
    meta,
    status,
    slots,
    held: heldAll,
    uploaded,
    reviewed,
    required: REQUIRED_TYPES.length,
    student: studentName(docs),
    checks,
    checksError,
    lastUpdated,
    openItems,
  };
}

// ---------------------------------------------------------------------------
// Review queue: one row per thing a person has to do
// ---------------------------------------------------------------------------

export type QueueKind = "low" | "medium" | "unreadable" | "unclassified" | "missing" | "warn" | "block";

export interface QueueItem {
  id: string;
  case_id: string;
  student: string | null;
  kind: QueueKind;
  issue: string;
  document: string;
  band: Confidence | "unreadable" | null;
  ruleId: string | null;
  since: string;
  href: string;
  action: string;
  primary: boolean;
}

export function queueItems(summaries: readonly CaseSummary[]): QueueItem[] {
  const out: QueueItem[] = [];
  for (const s of summaries) {
    const base = `/cases/${encodeURIComponent(s.case_id)}`;
    for (const u of s.held) {
      out.push({
        id: `held:${u.id}`,
        case_id: s.case_id,
        student: s.student.short,
        kind: "unclassified",
        issue: "Document type unconfirmed",
        document: u.pages.map((p) => p.filename).join(" + "),
        // For an "other" page the classifier's confidence says how sure it is
        // that the page is NOT one of the four types; showing it as a band
        // would read as confidence in a type. Only a real guess gets a band.
        band: u.suggested_type === "other" ? null : (u.pages[0]?.classification.confidence ?? null),
        ruleId: null,
        since: u.created_at,
        href: `${base}/classify`,
        action: "Review",
        primary: true,
      });
    }
    for (const slot of s.slots) {
      const d = slot.doc;
      if (!d || d.confirmed_json) continue;
      for (const v of fieldViews(d)) {
        if (v.status !== "low" && v.status !== "medium" && v.status !== "unreadable") continue;
        const kind: QueueKind = v.status;
        out.push({
          id: `field:${d.id}:${v.name}`,
          case_id: s.case_id,
          student: s.student.short,
          kind,
          issue: kind === "unreadable" ? `Unreadable ${v.label.toLowerCase()}` : `${kind === "low" ? "Low" : "Medium"}-confidence ${v.label.toLowerCase()}`,
          document: `${slot.label}${v.page !== null ? ` · p.${v.page}` : ""}`,
          band: kind,
          ruleId: null,
          since: d.created_at,
          href: `${base}/review/${d.id}#field-${v.name}`,
          action: "Review",
          primary: true,
        });
      }
    }
    for (const slot of s.slots) {
      if (slot.state !== "missing") continue;
      out.push({
        id: `missing:${s.case_id}:${slot.type}`,
        case_id: s.case_id,
        student: s.student.short,
        kind: "missing",
        issue: `${slot.label} not received`,
        document: "—",
        band: null,
        ruleId: null,
        since: s.meta.created_at,
        href: `${base}`,
        action: "Open case",
        primary: false,
      });
    }
    for (const c of s.checks?.checks ?? []) {
      if (c.status === "pending") continue;
      if (c.verdict !== "warn" && c.verdict !== "block") continue;
      if (c.verdict === "warn" && c.rule_id in s.meta.acknowledged) continue;
      out.push({
        id: `check:${s.case_id}:${c.rule_id}`,
        case_id: s.case_id,
        student: s.student.short,
        kind: c.verdict,
        issue: c.label,
        document: "—",
        band: null,
        ruleId: c.rule_id,
        since: s.lastUpdated,
        href: `${base}#check-${c.rule_id}`,
        action: c.verdict === "block" ? "View issue" : "Review",
        primary: c.verdict === "warn",
      });
    }
  }
  return out.sort((a, b) => a.since.localeCompare(b.since));
}
