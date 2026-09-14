import { NextRequest, NextResponse } from "next/server";

import { ExtractorError } from "../../../../lib/extractor";
import { extractUpload, isDocType } from "../../../../lib/intake";
import { getUpload, StoreError, uploadPages } from "../../../../lib/store";

export const runtime = "nodejs";

/** A person assigns a type to a held upload; it is then extracted as that type. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body: unknown = await req.json().catch(() => null);
  const docType = body !== null && typeof body === "object" && "doc_type" in body ? body.doc_type : null;
  if (!isDocType(docType)) return NextResponse.json({ error: "Invalid document type" }, { status: 400 });

  try {
    const up = await getUpload(id);
    if (!up) return NextResponse.json({ error: "Upload not found" }, { status: 404 });
    if (up.status === "extracted") {
      return NextResponse.json({ error: "This upload was already extracted; change the type from the review screen instead" }, { status: 409 });
    }
    // A person chose the type, so the classifier's guess is not recorded on the document.
    const doc = await extractUpload(up, await uploadPages(up), docType, null);
    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    if (e instanceof ExtractorError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof StoreError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
