import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "../components/icons";
import { PageHeader, TopBar } from "../components/shell";
import { loadAllSummaries } from "../lib/checks";
import { caseLabel, fmtMonth } from "../lib/format";
import { CasesDashboard, type CaseRow } from "./cases-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cases" };

type Search = Record<string, string | string[] | undefined>;

export default async function CasesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "";
  const status = (Array.isArray(sp.status) ? sp.status[0] : sp.status) ?? "";
  const summaries = await loadAllSummaries();

  const rows: CaseRow[] = summaries.map((s) => ({
    id: s.case_id,
    label: caseLabel(s.case_id),
    student: s.student.short,
    intake: s.meta.intake,
    intakeLabel: fmtMonth(s.meta.intake),
    uploaded: s.uploaded,
    required: s.required,
    reviewed: s.reviewed,
    status: s.status,
    lastUpdated: s.lastUpdated,
    href: `/cases/${encodeURIComponent(s.case_id)}`,
    action: s.status === "blocked" ? "View issue" : s.status === "needs_review" ? "Continue review" : "Open",
  }));

  return (
    <>
      <TopBar
        crumbs={[{ label: "Cases" }]}
        actions={
          <Link href="/cases/new" className="btn primary">
            <Icon name="plus" size={16} />
            New case
          </Link>
        }
      />
      <main className="content">
        <PageHeader
          title="Cases"
          subtitle="Review and validate student applications before submission."
          actions={
            <Link href="/cases/new" className="btn primary lg">
              <Icon name="plus" size={16} />
              New case
            </Link>
          }
        />
        <CasesDashboard rows={rows} initialQuery={q} initialStatus={status} />
      </main>
    </>
  );
}
