import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "../../../components/icons";
import { PageHeader, TopBar } from "../../../components/shell";
import { ProgressStepper } from "../../../components/ui";
import { loadCaseSummary } from "../../../lib/checks";
import { caseLabel } from "../../../lib/format";
import { ClassifyCards } from "./classify-cards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Classify" };

export default async function ClassifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await loadCaseSummary(id);
  if (!s) notFound();

  const docs = s.slots.filter((x) => x.doc).map((x) => x.doc!);
  const pages = docs.reduce((n, d) => n + d.page_count, 0) + s.held.reduce((n, u) => n + u.pages.length, 0);
  const canContinue = s.held.length === 0 && docs.length > 0;
  const firstUnreviewed = s.slots.find((x) => x.doc && x.state !== "reviewed")?.doc ?? docs[0];
  const reviewHref = firstUnreviewed ? `/cases/${encodeURIComponent(id)}/review/${firstUnreviewed.id}` : `/cases/${encodeURIComponent(id)}`;

  return (
    <>
      <TopBar
        crumbs={[{ label: "Cases", href: "/cases" }, { label: caseLabel(id), href: `/cases/${encodeURIComponent(id)}` }, { label: "Classify" }]}
        actions={
          <>
            <Link href="/cases/new" className="btn secondary">
              Add files
            </Link>
            <Link href={reviewHref} className={`btn primary${canContinue ? "" : " disabled"}`} aria-disabled={!canContinue} title={canContinue ? undefined : "Confirm every document type first"}>
              Continue to review
            </Link>
          </>
        }
      />
      <main className="content">
        <PageHeader
          title="Confirm document types"
          subtitle={
            <>
              {pages} page{pages === 1 ? "" : "s"} · {docs.length + s.held.length} document{docs.length + s.held.length === 1 ? "" : "s"} ·{" "}
              {s.held.length ? <span style={{ color: "var(--warning-text)" }}>{s.held.length} need{s.held.length === 1 ? "s" : ""} confirmation</span> : <span style={{ color: "var(--success-text)" }}>all types confirmed</span>}
            </>
          }
          actions={<ProgressStepper current={2} caseId={id} />}
        />
        <ClassifyCards caseId={id} docs={docs} held={s.held} />
        <div className="card compact" style={{ borderStyle: "dashed" }}>
          <div className="row wrap" style={{ gap: 12 }}>
            <span className="overline">Required document types</span>
            {s.slots.map((slot) => (
              <span key={slot.type} className={`pill ${slot.state === "missing" ? "neutral" : slot.state === "unclassified" ? "warn" : "info"}`}>
                <Icon name={slot.state === "missing" ? "pending" : slot.state === "unclassified" ? "tri" : "dot"} size={12} />
                {slot.label} · {slot.state === "missing" ? "not received" : slot.state === "unclassified" ? "unconfirmed" : "detected"}
              </span>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
