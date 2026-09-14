"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { CASE_STATUS, CaseStatusBadge, ProgressSegments } from "../components/badges";
import { Icon } from "../components/icons";
import { EmptyState } from "../components/ui";
import type { CaseStatus } from "../lib/case-status";
import { timeAgo } from "../lib/format";

export interface CaseRow {
  id: string;
  label: string;
  student: string | null;
  intake: string | null;
  intakeLabel: string;
  uploaded: number;
  required: number;
  reviewed: number;
  status: CaseStatus;
  lastUpdated: string;
  href: string;
  action: string;
}

type SortKey = "id" | "student" | "intake" | "status" | "lastUpdated";
const PAGE = 25;
const STATUS_ORDER: Record<CaseStatus, number> = { blocked: 0, needs_review: 1, pending_documents: 2, ready: 3 };

export function CasesDashboard({ rows, initialQuery, initialStatus }: { rows: CaseRow[]; initialQuery: string; initialStatus: string }) {
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState<CaseStatus | "">(isStatus(initialStatus) ? initialStatus : "");
  const [intake, setIntake] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "lastUpdated", dir: -1 });
  const [page, setPage] = useState(0);

  const counts = useMemo(
    () => ({
      total: rows.length,
      ready: rows.filter((r) => r.status === "ready").length,
      needs_review: rows.filter((r) => r.status === "needs_review").length,
      blocked: rows.filter((r) => r.status === "blocked").length,
    }),
    [rows],
  );
  const intakes = useMemo(() => [...new Set(rows.map((r) => r.intake).filter((x): x is string => !!x))].sort().reverse(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const xs = rows.filter(
      (r) =>
        (!status || r.status === status) &&
        (!intake || r.intake === intake) &&
        (!needle || r.id.toLowerCase().includes(needle) || (r.student ?? "").toLowerCase().includes(needle)),
    );
    const cmp = (a: CaseRow, b: CaseRow): number => {
      switch (sort.key) {
        case "id":
          return a.id.localeCompare(b.id, undefined, { numeric: true });
        case "student":
          return (a.student ?? "~").localeCompare(b.student ?? "~");
        case "intake":
          return (a.intake ?? "").localeCompare(b.intake ?? "");
        case "status":
          return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        case "lastUpdated":
          return a.lastUpdated.localeCompare(b.lastUpdated);
      }
    };
    return xs.sort((a, b) => cmp(a, b) * sort.dir);
  }, [rows, q, status, intake, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * PAGE, cur * PAGE + PAGE);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "lastUpdated" ? -1 : 1 }));
  const pick = (s: CaseStatus | "") => {
    setStatus((cur) => (cur === s ? "" : s));
    setPage(0);
  };

  const Metric = ({ label, n, s, tone }: { label: string; n: number; s: CaseStatus | ""; tone?: "ok" | "warn" | "err" }) => (
    <button type="button" className={`metric${tone ? ` stripe ${tone}` : ""}${status === s && s !== "" ? " selected" : ""}`} onClick={() => pick(s)} aria-pressed={status === s && s !== ""}>
      <div className="label">{label}</div>
      <div className="num">{n}</div>
      <div className="muted small">{s ? (status === s ? "Filter on · click to clear" : "Click to filter") : intakes.length ? `across ${intakes.length} intake${intakes.length === 1 ? "" : "s"}` : "no intake set"}</div>
    </button>
  );

  const Th = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={right ? "right" : undefined} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => toggleSort(k)}>
        {children}
        {sort.key === k && <Icon name={sort.dir === 1 ? "chevu" : "chevd"} size={10} />}
      </button>
    </th>
  );

  return (
    <>
      <div className="metrics">
        <Metric label="Total cases" n={counts.total} s="" />
        <Metric label="Ready to submit" n={counts.ready} s="ready" tone="ok" />
        <Metric label="Needs review" n={counts.needs_review} s="needs_review" tone="warn" />
        <Metric label="Blocked" n={counts.blocked} s="blocked" tone="err" />
      </div>

      <div className="tbl">
        <div className="filterbar">
          <div className="search" style={{ width: 320, height: 32 }}>
            <Icon name="search" size={14} />
            <input value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} placeholder="Search by case ID or student" aria-label="Search cases" />
          </div>
          <div className="spacer" />
          <select className="select" value={status} onChange={(e) => (setStatus(e.target.value as CaseStatus | ""), setPage(0))} aria-label="Status filter">
            <option value="">Status: All</option>
            {(Object.keys(CASE_STATUS) as CaseStatus[]).map((k) => (
              <option key={k} value={k}>
                {CASE_STATUS[k].label}
              </option>
            ))}
          </select>
          <select className="select" value={intake} onChange={(e) => (setIntake(e.target.value), setPage(0))} aria-label="Intake filter">
            <option value="">Intake: All</option>
            {intakes.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        {slice.length === 0 ? (
          <div style={{ padding: 16 }}>
            <EmptyState
              title={rows.length === 0 ? "No cases yet" : "No cases match these filters"}
              body={rows.length === 0 ? "Start a new case by uploading a student's documents." : "Clear the filters or search by case ID or surname."}
              action={
                rows.length === 0 ? (
                  <Link href="/cases/new" className="btn primary sm">
                    New case
                  </Link>
                ) : (
                  <button type="button" className="btn secondary sm" onClick={() => (setQ(""), setStatus(""), setIntake(""))}>
                    Clear filters
                  </button>
                )
              }
            />
          </div>
        ) : (
          <div className="tbl-scroll">
            <table>
              <thead>
                <tr>
                  <Th k="id">Case</Th>
                  <Th k="student">Student</Th>
                  <Th k="intake">Intake</Th>
                  <th>Documents</th>
                  <th>Review progress</th>
                  <Th k="status">Status</Th>
                  <Th k="lastUpdated">Last updated</Th>
                  <th className="right" />
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">
                      <Link href={r.href} style={{ color: "inherit" }}>
                        {r.label}
                      </Link>
                    </td>
                    <td>{r.student ?? <span className="muted">Passport not confirmed</span>}</td>
                    <td>{r.intakeLabel}</td>
                    <td>
                      {r.uploaded} / {r.required}
                    </td>
                    <td>
                      <ProgressSegments filled={r.reviewed} total={r.required} />
                    </td>
                    <td>
                      <CaseStatusBadge status={r.status} />
                    </td>
                    <td className="muted">{timeAgo(r.lastUpdated)}</td>
                    <td className="right">
                      <Link href={r.href} className={`btn sm ${r.status === "blocked" || r.status === "needs_review" ? "secondary" : "secondary"}`}>
                        {r.action}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pager">
          <span>
            Showing {filtered.length === 0 ? 0 : cur * PAGE + 1}–{Math.min(filtered.length, (cur + 1) * PAGE)} of {filtered.length}
          </span>
          <span className="row">
            <button type="button" className="icbtn sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={cur === 0} aria-label="Previous page">
              <Icon name="chevl" size={12} />
            </button>
            <span className="tnum">
              {cur + 1} / {pages}
            </span>
            <button type="button" className="icbtn sm" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={cur >= pages - 1} aria-label="Next page">
              <Icon name="chev" size={12} />
            </button>
          </span>
        </div>
      </div>
    </>
  );
}

function isStatus(s: string): s is CaseStatus {
  return s in CASE_STATUS;
}
