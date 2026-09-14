import { NextRequest, NextResponse } from "next/server";

import { extractDocument, ExtractorError } from "../../../../lib/extractor";
import { isDocType } from "../../../../lib/intake";
import {
  createDocument,
  getDocument,
  pagesOf,
  StoreError,
  updateDocument,
  updateUpload,
} from "../../../../lib/store";

export const runtime = "nodejs";

/**
 * The reviewer says the sorter got the type wrong. The same pages are
 * extracted again under the new type as a NEW document; the old one is
 * marked superseded and drops out of the list. Its extracted_json is never
 * edited, and any confirmations made against the wrong schema go with it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body: unknown = await req.json().catch(() => null);
  const docType = body !== null && typeof body === "object" && "doc_type" in body ? body.doc_type : null;
  if (!isDocType(docType)) return NextResponse.json({ error: "Invalid document type" }, { status: 400 });

  try {
    const old = await getDocument(id);
    if (!old) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    if (old.superseded_by) return NextResponse.json({ error: "This document has already been superseded" }, { status: 409 });
    if (old.doc_type === docType) return NextResponse.json({ error: "The document already has this type" }, { status: 400 });

    const pages = await pagesOf(old);
    const extracted_json = await extractDocument(docType, pages);
    const doc = await createDocument({
      case_id: old.case_id,
      doc_type: docType,
      filename: old.filename,
      content_type: old.content_type,
      extracted_json,
      upload_id: old.upload_id ?? undefined,
      bytes: old.upload_id ? undefined : pages[0].bytes,
      page_count: pages.length,
      classification: null, // a person chose this type
    });
    await updateDocument(old.id, (d) => ({ ...d, superseded_by: doc.id }));
    if (old.upload_id) await updateUpload(old.upload_id, (u) => ({ ...u, document_id: doc.id }));
    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    if (e instanceof ExtractorError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof StoreError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
