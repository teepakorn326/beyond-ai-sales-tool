// The batch intake: classify, group, extract, store. Shared by the batch
// upload route and the held-upload / re-sort routes so every document,
// however it arrived, is created the same way.

import "server-only";

import { classifyFiles, extractDocument, ExtractorError, renderFiles, type FilePart } from "./extractor";
import { groupPages } from "./sorting";
import { createDocument, createUpload, updateUpload, type PageBytes } from "./store";
import { DOC_TYPES, type Classification, type DocType, type ReviewDocument, type UploadRecord } from "../types";

export const IMAGE_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
export const MAX_BYTES = 5 * 1024 * 1024; // matches the extractor's demo-mode cap

export function isDocType(v: unknown): v is DocType {
  return typeof v === "string" && (DOC_TYPES as readonly string[]).includes(v);
}

export async function fileParts(files: File[]): Promise<FilePart[]> {
  return Promise.all(
    files.map(async (f) => ({
      filename: f.name,
      content_type: f.type,
      bytes: new Uint8Array(await f.arrayBuffer()),
    })),
  );
}

export interface IntakeResult {
  uploads: UploadRecord[];
  documents: ReviewDocument[];
}

/** Extract an upload's pages as `docType` and link the resulting document. */
export async function extractUpload(
  up: UploadRecord,
  pages: PageBytes[],
  docType: DocType,
  classification: Classification | null,
): Promise<ReviewDocument> {
  const extracted_json = await extractDocument(docType, pages);
  const doc = await createDocument({
    case_id: up.case_id,
    doc_type: docType,
    filename: [...new Set(pages.map((p) => p.filename))].join(" + "),
    content_type: pages[0].content_type,
    extracted_json,
    upload_id: up.id,
    page_count: pages.length,
    classification,
  });
  await updateUpload(up.id, (u) => ({ ...u, status: "extracted", document_id: doc.id, held_reason: null }));
  return doc;
}

/**
 * Sort a batch of files into documents. Every file is first rendered to
 * JPEG pages (a PDF or HEIC cannot be shown in the browser as sent), the
 * first page of each file is classified, files are grouped by code, and
 * each group that the sorter is confident about is extracted from those same
 * pages. Anything else is held with a reason for a person to sort.
 */
export async function intakeBatch(caseId: string, files: FilePart[]): Promise<IntakeResult> {
  const rendered = await renderFiles(files);
  const classifications = await classifyFiles(rendered.map((pages) => pages[0]));
  const groups = groupPages(classifications);

  const uploads: UploadRecord[] = [];
  const documents: ReviewDocument[] = [];
  for (const g of groups) {
    const pages = g.pages.flatMap((i) => rendered[i].map((p) => ({ ...p, classification: classifications[i] })));
    const up = await createUpload({
      case_id: caseId,
      pages,
      suggested_type: g.type,
      status: "held",
      held_reason: g.held_reason,
    });
    uploads.push(up);
    if (g.status !== "extract" || g.type === "other") continue;

    try {
      const doc = await extractUpload(up, pages, g.type, classifications[g.pages[0]]);
      documents.push(doc);
      uploads[uploads.length - 1] = { ...up, status: "extracted", document_id: doc.id };
    } catch (e) {
      // Sorting worked, extraction did not: keep the pages, say why, let a
      // person retry with the type they choose.
      const reason = e instanceof ExtractorError ? e.message : "extraction failed";
      const held = await updateUpload(up.id, (u) => ({ ...u, held_reason: `Extraction failed: ${reason}` }));
      if (held) uploads[uploads.length - 1] = held;
    }
  }
  return { uploads, documents };
}
