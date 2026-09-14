import { notFound } from "next/navigation";

import { getDocument, StoreError } from "../../lib/store";
import ReviewScreen from "./review-screen";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let doc;
  try {
    doc = await getDocument(id);
  } catch (e) {
    if (e instanceof StoreError) notFound();
    throw e;
  }
  if (!doc) notFound();
  return <ReviewScreen initial={doc} />;
}
