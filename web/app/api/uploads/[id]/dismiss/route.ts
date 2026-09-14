import { NextResponse } from "next/server";

import { getUpload, StoreError, updateUpload } from "../../../../lib/store";

export const runtime = "nodejs";

/**
 * A person looked at a held page group and decided it is not one of the
 * required documents (a fee receipt, a photo of the wrong thing). The pages
 * are kept, nothing is extracted, and the group stops blocking the case.
 * Internal and reversible: re-sorting it later is a matter of extracting it.
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const up = await getUpload(id);
    if (!up) return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    if (up.status === "extracted") {
      return NextResponse.json({ error: "This upload was already read as a document; change its type from the review screen instead" }, { status: 409 });
    }
    const next = await updateUpload(id, (u) => ({ ...u, status: "dismissed", held_reason: "Marked as not a required document by a reviewer" }));
    return NextResponse.json(next);
  } catch (e) {
    if (e instanceof StoreError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
