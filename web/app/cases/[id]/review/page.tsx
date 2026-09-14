import { notFound, redirect } from "next/navigation";

import { loadCaseSummary } from "../../../lib/checks";

export const dynamic = "force-dynamic";

/** Step 3 entry: jumps to the first document that still needs a person. */
export default async function ReviewIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await loadCaseSummary(id);
  if (!s) notFound();
  const base = `/cases/${encodeURIComponent(id)}`;
  if (s.held.length) redirect(`${base}/classify`);
  const next = s.slots.find((x) => x.doc && x.state !== "reviewed")?.doc ?? s.slots.find((x) => x.doc)?.doc;
  redirect(next ? `${base}/review/${next.id}` : `${base}/classify`);
}
