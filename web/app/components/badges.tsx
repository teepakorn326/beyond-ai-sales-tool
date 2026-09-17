// Status is communicated three ways at once: a fixed glyph, a label and a
// colour. The mappings below are the only place those three are bound, so a
// state can never render green by accident.
//
// Vocabulary is deliberately small. A reviewer meets these words on every
// screen, so each one is a verb or a state they already know.

import { Ban, Check, Clock, Dot, Mail, Pencil, ScanLine, TriangleAlert, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CheckStatus, Confidence, Verdict } from "../types";
import type { CaseStatus, DocState } from "../lib/case-status";

type Tone = "ok" | "warn" | "err" | "info" | "neutral";

const TONE: Record<Tone, string> = {
  ok: "bg-(--success-soft) text-(--success-text)",
  warn: "bg-(--warning-soft) text-(--warning-text)",
  err: "bg-(--error-soft) text-(--error-text)",
  info: "bg-(--primary-soft) text-(--info-text)",
  neutral: "bg-muted text-(--text-2) border-border",
};

export function Pill({ tone, icon: Icon, className, children }: { tone: Tone; icon: LucideIcon; className?: string; children: React.ReactNode }) {
  return (
    <Badge variant="outline" className={cn("h-[22px] gap-1.5 border-transparent px-2.5", TONE[tone], className)}>
      <Icon aria-hidden="true" />
      {children}
    </Badge>
  );
}

export const CASE_STATUS: Record<CaseStatus, { tone: Tone; icon: LucideIcon; label: string }> = {
  blocked: { tone: "err", icon: Ban, label: "Blocked" },
  pending_documents: { tone: "neutral", icon: Clock, label: "Waiting for documents" },
  needs_review: { tone: "warn", icon: TriangleAlert, label: "Needs review" },
  ready: { tone: "ok", icon: Check, label: "Ready" },
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
      <Pill tone="neutral" icon={Clock}>
        Waiting
      </Pill>
    );
  if (verdict === "block")
    return (
      <Pill tone="err" icon={Ban}>
        Blocked
      </Pill>
    );
  if (verdict === "warn")
    return (
      <Pill tone="warn" icon={TriangleAlert}>
        Check
      </Pill>
    );
  return (
    <Pill tone="ok" icon={Check}>
      Passed
    </Pill>
  );
}

export const DOC_STATE: Record<DocState, { tone: Tone; icon: LucideIcon; label: string }> = {
  reviewed: { tone: "ok", icon: Check, label: "Confirmed" },
  needs_review: { tone: "warn", icon: TriangleAlert, label: "Needs review" },
  unclassified: { tone: "warn", icon: TriangleAlert, label: "Type unconfirmed" },
  requested: { tone: "neutral", icon: Mail, label: "Requested" },
  missing: { tone: "neutral", icon: Clock, label: "Not received" },
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
        <Pill tone="ok" icon={Dot}>
          {short ? "High" : "High confidence"}
        </Pill>
      );
    case "medium":
      return (
        <Pill tone="warn" icon={TriangleAlert}>
          {short ? "Medium" : "Check"}
        </Pill>
      );
    case "low":
      return (
        <Pill tone="err" icon={TriangleAlert}>
          {short ? "Low" : "Check closely"}
        </Pill>
      );
    case "unreadable":
      return (
        <Pill tone="err" icon={ScanLine}>
          Unreadable
        </Pill>
      );
  }
}

export type Provenance = "extracted" | "confirmed" | "edited";

export function ProvenanceChip({ kind }: { kind: Provenance }) {
  if (kind === "confirmed")
    return (
      <Badge variant="outline" className="h-5 gap-1 border-(--success) text-(--success-text)">
        <Check aria-hidden="true" />
        Confirmed
      </Badge>
    );
  if (kind === "edited")
    return (
      <Badge variant="outline" className="h-5 gap-1 border-(--primary) text-(--info-text)">
        <Pencil aria-hidden="true" />
        Edited
      </Badge>
    );
  return (
    <Badge variant="outline" className="h-5 gap-1 text-muted-foreground">
      Extracted
    </Badge>
  );
}

export function ProgressSegments({ filled, total }: { filled: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={cn("block h-2 w-3.5 rounded-xs", i < filled ? "bg-primary" : "bg-(--border-strong)")} />
        ))}
      </span>
      <span className="text-muted-foreground tabular-nums">
        {filled}/{total}
      </span>
    </span>
  );
}
