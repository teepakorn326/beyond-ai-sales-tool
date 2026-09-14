import type { Metadata } from "next";

import { PageHeader, TopBar } from "../components/shell";
import { queueItems } from "../lib/case-status";
import { loadAllSummaries } from "../lib/checks";
import { QueueTable } from "./queue-table";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review queue" };

type Search = Record<string, string | string[] | undefined>;

export default async function QueuePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) ?? "all";
  const items = queueItems(await loadAllSummaries());
  return (
    <>
      <TopBar crumbs={[{ label: "Review queue" }]} />
      <main className="content">
        <PageHeader title="Review queue" subtitle="Items waiting for a person. Oldest first." />
        <QueueTable items={items} initialTab={tab} />
      </main>
    </>
  );
}
