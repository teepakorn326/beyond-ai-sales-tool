// Status is communicated three ways at once: a fixed glyph, a label and a
// colour. The mappings below are the only place those three are bound, so a
// state can never render green by accident.

import type { CheckStatus, Confidence, Verdict } from "../types";
import type { CaseStatus, DocState } from "../lib/case-status";
import { Icon, type IconName } from "./icons";

type Tone = "ok" | "warn" | "err" | "info" | "neutral";

export function Pill({ tone, icon, children }: { tone: Tone; icon: IconName; children: React.ReactNode }) {
  return (
    <span className={`pill ${tone}`}>
      <Icon name={icon} size={12} />
      {children}
    </span>
  );
}

export const CASE_STATUS: Record<CaseStatus, { tone: Tone; icon: IconName; label: string }> = {
  blocked: { tone: "err", icon: "block", label: "Blocked" },
  pending_documents: { tone: "neutral", icon: "pending", label: "Pending documents" },
  needs_review: { tone: "warn", icon: "tri", label: "Needs review" },
  ready: { tone: "ok", icon: "check", label: "Ready" },
};

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const s = CASE_STATUS[status];
  return (
    <Pill tone={s.tone} icon={s.icon}>
      {s.label}
    </Pill>
  );
}

/** Rule verdict. Pending is never green; warn is never green. */
export function VerdictBadge({ verdict, status }: { verdict: Verdict; status: CheckStatus }) {
  if (status === "pending")
    return (
      <Pill tone="neutral" icon="pending">
        Pending
      </Pill>
    );
  if (verdict === "block")
    return (
      <Pill tone="err" icon="block">
        Blocked
      </Pill>
    );
  if (verdict === "warn")
    return (
      <Pill tone="warn" icon="tri">
        Warning
      </Pill>
    );
  return (
    <Pill tone="ok" icon="check">
      Passed
    </Pill>
  );
}

export const DOC_STATE: Record<DocState, { tone: Tone; icon: IconName; label: string }> = {
  reviewed: { tone: "ok", icon: "check", label: "Reviewed" },
  needs_review: { tone: "warn", icon: "tri", label: "Needs review" },
  unclassified: { tone: "warn", icon: "tri", label: "Type unconfirmed" },
  requested: { tone: "neutral", icon: "mail", label: "Requested from student" },
  missing: { tone: "neutral", icon: "pending", label: "Not received" },
};

export function DocStateBadge({ state }: { state: DocState }) {
  const s = DOC_STATE[state];
  return (
    <Pill tone={s.tone} icon={s.icon}>
      {s.label}
    </Pill>
  );
}

/** Confidence is a band with an instruction, never a bar. */
export function ConfidenceBadge({ band, short = false }: { band: Confidence | "unreadable"; short?: boolean }) {
  switch (band) {
    case "high":
      return (
        <Pill tone="ok" icon="dot">
          {short ? "High" : "High confidence"}
        </Pill>
      );
    case "medium":
      return (
        <Pill tone="warn" icon="tri">
          {short ? "Medium" : "Review recommended"}
        </Pill>
      );
    case "low":
      return (
        <Pill tone="err" icon="tri-fill">
          {short ? "Low" : "Needs confirmation"}
        </Pill>
      );
    case "unreadable":
      return (
        <Pill tone="err" icon="block">
          {short ? "Unreadable" : "Unable to read"}
        </Pill>
      );
  }
}

export type Provenance = "extracted" | "confirmed" | "edited";

export function ProvenanceChip({ kind }: { kind: Provenance }) {
  if (kind === "confirmed")
    return (
      <span className="chip confirmed">
        <Icon name="check" size={11} />
        Reviewer confirmed
      </span>
    );
  if (kind === "edited")
    return (
      <span className="chip edited">
        <Icon name="pencil" size={11} />
        Edited by reviewer
      </span>
    );
  return (
    <span className="chip">
      <Icon name="dotted" size={11} />
      Extracted
    </span>
  );
}

export function ProgressSegments({ filled, total }: { filled: number; total: number }) {
  return (
    <span className="row" style={{ gap: 8 }}>
      <span className="seg" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={i < filled ? "on" : ""} />
        ))}
      </span>
      <span className="muted tnum">
        {filled}/{total}
      </span>
    </span>
  );
}
