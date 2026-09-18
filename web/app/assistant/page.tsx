import type { Metadata } from "next";
import Link from "next/link";

import { CaseStatusBadge } from "../components/badges";
import { PageHeader, TopBar } from "../components/shell";
import { agentHasModel } from "../lib/agent-status";
import { loadAllSummaries } from "../lib/checks";
import { caseLabel } from "../lib/format";
import { AssistantThread, type CaseOption } from "./assistant-thread";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Case assistant" };

type Search = Record<string, string | string[] | undefined>;

export default async function AssistantPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.case) ? sp.case[0] : sp.case;
  const summaries = await loadAllSummaries();
  const options: CaseOption[] = summaries.map((s) => ({ id: s.case_id, label: caseLabel(s.case_id), student: s.student.short, status: s.status }));
  const selected = raw && options.some((o) => o.id === raw) ? raw : (options[0]?.id ?? null);
  const current = options.find((o) => o.id === selected) ?? null;
  const hasModel = await agentHasModel();

  return (
    <>
      <TopBar
        crumbs={[{ label: "Assistant" }, ...(current ? [{ label: current.label }] : [])]}
        actions={
          current && (
            <Link href={`/cases/${encodeURIComponent(current.id)}`} className="btn secondary">
              Open case
            </Link>
          )
        }
      />
      <main className="content">
        <PageHeader
          title="Case Assistant"
          subtitle="Ask questions about this case. Answers cite the case record; actions that contact a student need your approval."
          actions={
            current && (
              <span className="chip" style={{ height: 28, padding: "0 10px", fontSize: 13, gap: 8 }}>
                {current.label}
                {current.student ? ` · ${current.student}` : ""}
                <CaseStatusBadge status={current.status} />
              </span>
            )
          }
        />
        <AssistantThread options={options} selected={selected} hasModel={hasModel} />
      </main>
    </>
  );
}
