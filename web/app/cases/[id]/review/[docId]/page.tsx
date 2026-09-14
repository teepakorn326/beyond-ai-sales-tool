import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { loadCaseSummary } from "../../../../lib/checks";
import { caseLabel } from "../../../../lib/format";
import { DOC_TYPE_LABELS } from "../../../../lib/review";
import { getDocument, StoreError } from "../../../../lib/store";
import { ReviewScreen, type DocTab } from "./review-screen";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string; docId: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Review · ${caseLabel(id)}` };
}

export default async function DocumentReviewPage({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  let doc;
  try {
    doc = await getDocument(docId);
  } catch (e) {
    if (e instanceof StoreError) notFound();
    throw e;
  }
  if (!doc || doc.case_id !== id) notFound();
  if (doc.superseded_by) redirect(`/cases/${encodeURIComponent(id)}/review/${doc.superseded_by}`);

  const s = await loadCaseSummary(id);
  if (!s) notFound();

  const tabs: DocTab[] = s.slots
    .filter((x) => x.doc)
    .map((x) => ({ docId: x.doc!.id, label: DOC_TYPE_LABELS[x.type], reviewed: x.state === "reviewed", left: x.fieldsLeft }));

  return <ReviewScreen initial={doc} caseId={id} tabs={tabs} />;
}
