import { notFound, redirect } from "next/navigation";

import { getDocument, StoreError } from "../../lib/store";

export const dynamic = "force-dynamic";

/** Old review URL. Documents now live under their case. */
export default async function LegacyReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let doc;
  try {
    doc = await getDocument(id);
  } catch (e) {
    if (e instanceof StoreError) notFound();
    throw e;
  }
  if (!doc) notFound();
  redirect(`/cases/${encodeURIComponent(doc.case_id)}/review/${doc.id}`);
}
