"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ConfidenceBadge } from "../components/badges";
import { Icon, type IconName } from "../components/icons";
import { EmptyState } from "../components/ui";
import type { QueueItem, QueueKind } from "../lib/case-status";
import { caseLabel, waiting } from "../lib/format";

type Tab = "all" | "high" | "low" | "missing" | "blocked";
const TABS: { id: Tab; label: string; keep: (k: QueueKind) => boolean }[] = [
  { id: "all", label: "All", keep: () => true },
  { id: "high", label: "High priority", keep: (k) => k === "block" || k === "unreadable" },
  { id: "low", label: "Low confidence", keep: (k) => k === "low" || k === "unclassified" },
  { id: "missing", label: "Missing documents", keep: (k) => k === "missing" },
  { id: "blocked", label: "Blocked", keep: (k) => k === "block" },
];
const KIND_ICON: Record<QueueKind, { icon: IconName; colour: string }> = {
  low: { icon: "tri-fill", colour: "var(--error)" },
  medium: { icon: "tri", colour: "var(--warning)" },
  unreadable: { icon: "block", colour: "var(--error)" },
  unclassified: { icon: "tri", colour: "var(--warning)" },
  missing: { icon: "pending", colour: "var(--muted)" },
  warn: { icon: "tri", colour: "var(--warning)" },
  block: { icon: "block", colour: "var(--error)" },
};

export function QueueTable({ items, initialTab }: { items: QueueItem[]; initialTab: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === initialTab) ? (initialTab as Tab) : "all");
  const [focus, setFocus] = useState(0);
  const [mine, setMine] = useState(false);
  const now = useMemo(() => Date.now(), []);

  const rows = useMemo(() => items.filter((i) => TABS.find((t) => t.id === tab)!.keep(i.kind)), [items, tab]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, items.filter((i) => t.keep(i.kind)).length])) as Record<Tab, number>, [items]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowDown") (e.preventDefault(), setFocus((f) => Math.min(rows.length - 1, f + 1)));
      else if (e.key === "ArrowUp") (e.preventDefault(), setFocus((f) => Math.max(0, f - 1)));
      else if (e.key === "Enter" && rows[focus]) router.push(rows[focus].href);
      else if (/^[1-5]$/.test(e.key)) (setTab(TABS[Number(e.key) - 1].id), setFocus(0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, focus, router]);

  return (
    <>
      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <div className="tabs" role="tablist" style={{ flex: 1 }}>
          {TABS.map((t, i) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? " on" : ""}`} onClick={() => (setTab(t.id), setFocus(0))} title={`Press ${i + 1}`}>
              {t.label}
              <span className="count">{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <label className="row muted" style={{ gap: 6 }}>
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Mine only
          <span className="small">(no sign-in yet)</span>
        </label>
      </div>

      <div className="tbl">
        {rows.length === 0 ? (
          <div style={{ padding: 16 }}>
            <EmptyState icon="list" title={items.length === 0 ? "Queue is clear" : "Nothing in this tab"} body={items.length === 0 ? "Nothing is waiting for a reviewer right now." : "Try another tab."} />
          </div>
        ) : (
          <div className="tbl-scroll">
            <table>
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Student</th>
                  <th>Issue</th>
                  <th>Document</th>
                  <th>Confidence</th>
                  <th>Waiting</th>
                  <th>Assigned reviewer</th>
                  <th className="right" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const w = waiting(r.since, now);
                  const k = KIND_ICON[r.kind];
                  return (
                    <tr key={r.id} className={i === focus ? "focused" : undefined} onMouseEnter={() => setFocus(i)}>
                      <td className="mono">
                        <Link href={`/cases/${encodeURIComponent(r.case_id)}`} style={{ color: "inherit" }}>
                          {caseLabel(r.case_id)}
                        </Link>
                      </td>
                      <td className="nowrap">{r.student ?? <span className="muted">—</span>}</td>
                      <td>
                        <span className="row" style={{ gap: 8 }}>
                          <span style={{ color: k.colour }}>
                            <Icon name={k.icon} size={14} />
                          </span>
                          {r.issue}
                          {r.ruleId && <span className="mono muted">{r.ruleId}</span>}
                        </span>
                      </td>
                      <td className="muted">{r.document}</td>
                      <td>{r.band ? <ConfidenceBadge band={r.band} short /> : <span className="muted">—</span>}</td>
                      <td style={{ color: w.tone === "err" ? "var(--error-text)" : w.tone === "warn" ? "var(--warning-text)" : undefined }}>{w.text}</td>
                      <td className="muted">Unassigned</td>
                      <td className="right">
                        <Link href={r.href} className={`btn sm ${r.primary ? "primary" : "secondary"}`}>
                          {r.action}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="pager">
          <span className="row" style={{ gap: 14 }}>
            <span>
              <kbd className="key">↑↓</kbd> move
            </span>
            <span>
              <kbd className="key">Enter</kbd> open
            </span>
            <span>
              <kbd className="key">1–5</kbd> switch tab
            </span>
          </span>
          <span>
            {rows.length} of {items.length} item{items.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </>
  );
}
