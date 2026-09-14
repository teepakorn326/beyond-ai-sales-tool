// Loads everything a screen needs about one case or every case: documents,
// held uploads, metadata, and the rules result built from confirmed_json only.

import "server-only";

import type { CheckResult, ReviewDocument, UploadRecord } from "../types";
import { defaultMeta, getCaseMeta, listCaseMeta } from "./cases";
import { summarize, type CaseMeta, type CaseSummary } from "./case-status";
import { checkCase, ExtractorError } from "./extractor";
import { buildCase } from "./review";
import { listDocuments, listUploads } from "./store";

export interface CheckOutcome {
  result: CheckResult | null;
  error: string | null;
}

/**
 * Runs the rules engine on the confirmed data of one case. Nothing here reads
 * extracted_json. With no confirmed document at all the call is skipped: every
 * rule would report pending, and the summary already says the documents are
 * missing or unreviewed.
 */
export async function runChecks(docs: readonly ReviewDocument[], meta: CaseMeta): Promise<CheckOutcome> {
  if (!docs.some((d) => d.confirmed_json)) return { result: null, error: null };
  try {
    const c = buildCase(docs, meta.case_id, meta.course_end_date, meta.submission_target);
    return { result: await checkCase(c), error: null };
  } catch (e) {
    return { result: null, error: e instanceof ExtractorError ? e.message : "The rules service did not respond" };
  }
}

export async function loadCaseSummary(caseId: string): Promise<CaseSummary | null> {
  const [docsAll, uploads, meta] = await Promise.all([listDocuments(), listUploads(caseId), getCaseMeta(caseId)]);
  const docs = docsAll.filter((d) => d.case_id === caseId);
  if (!meta && docs.length === 0 && uploads.length === 0) return null;
  const m = meta ?? defaultMeta(caseId, docs.at(-1)?.created_at ?? uploads[0]?.created_at);
  const { result, error } = await runChecks(docs, m);
  return summarize(caseId, m, docs, uploads, result, error);
}

export async function loadAllSummaries(): Promise<CaseSummary[]> {
  const [docs, uploads, metas] = await Promise.all([listDocuments(), listUploads(), listCaseMeta()]);
  const ids = new Set<string>([...metas.keys(), ...docs.map((d) => d.case_id), ...uploads.map((u) => u.case_id)]);
  const summaries = await Promise.all(
    [...ids].map(async (id) => {
      const caseDocs = docs.filter((d) => d.case_id === id);
      const caseUploads: UploadRecord[] = uploads.filter((u) => u.case_id === id);
      const meta = metas.get(id) ?? defaultMeta(id, caseDocs.at(-1)?.created_at ?? caseUploads[0]?.created_at);
      const { result, error } = await runChecks(caseDocs, meta);
      return summarize(id, meta, caseDocs, caseUploads, result, error);
    }),
  );
  return summaries.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
}
