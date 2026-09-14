import { NextRequest, NextResponse } from "next/server";

import { ExtractorError, extractDocument } from "../../lib/extractor";
import { fileParts, IMAGE_TYPES, isDocType, MAX_BYTES } from "../../lib/intake";
import { createDocument, createUpload, listDocuments, updateUpload } from "../../lib/store";

export const runtime = "nodejs";

function bad(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET() {
  return NextResponse.json(await listDocuments());
}

/**
 * Manual route: a person names the type up front and the files are the
 * pages of that one document. For a pile of photos in any order, use
 * /api/documents/batch, which sorts them first.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const docType = form.get("doc_type");
  const caseId = form.get("case_id");
  const files = [...form.getAll("files"), form.get("file")].filter(
    (f): f is File => f instanceof File && f.size > 0,
  );

  if (files.length === 0) return bad("Attach at least one document file");
  if (!isDocType(docType)) return bad("Invalid document type");
  if (typeof caseId !== "string" || !/^[A-Za-z0-9-]{1,40}$/.test(caseId)) {
    return bad("Case id may contain only letters, digits and dashes, up to 40 characters");
  }
  for (const f of files) {
    if (!IMAGE_TYPES.has(f.type)) return bad(`${f.name}: only PNG, JPEG, WebP, HEIC or PDF are accepted`);
    if (f.size > MAX_BYTES) return bad(`${f.name}: file is larger than 5MB`);
  }

  try {
    const parts = await fileParts(files);
    const extracted_json = await extractDocument(docType, parts);
    if (parts.length === 1) {
      const doc = await createDocument({
        case_id: caseId,
        doc_type: docType,
        filename: parts[0].filename,
        content_type: parts[0].content_type,
        bytes: parts[0].bytes,
        extracted_json,
      });
      return NextResponse.json(doc, { status: 201 });
    }
    // Several pages, one document: keep them on an upload record so the
    // review screen can show every page.
    const up = await createUpload({
      case_id: caseId,
      pages: parts.map((p) => ({
        ...p,
        classification: { doc_type: docType, confidence: "high", reason: "chosen by reviewer", is_continuation: false },
      })),
      suggested_type: docType,
      status: "held",
      held_reason: null,
    });
    const doc = await createDocument({
      case_id: caseId,
      doc_type: docType,
      filename: parts.map((p) => p.filename).join(" + "),
      content_type: parts[0].content_type,
      extracted_json,
      upload_id: up.id,
      page_count: parts.length,
    });
    await updateUpload(up.id, (u) => ({ ...u, status: "extracted", document_id: doc.id }));
    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    if (e instanceof ExtractorError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
