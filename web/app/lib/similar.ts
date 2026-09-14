// Similar-case search and duplicate-student detection over case_profiles.
// The profile text is PII-free by construction (profile.ts); the identity
// hash is salted SHA-256 and the values are never stored or compared in the
// open. Refreshes are best-effort: a failure here never blocks a confirm.

import "server-only";

import { defaultMeta, getCaseMeta, listCaseMeta } from "./cases";
import { pool } from "./db";
import { embedTexts, toVectorLiteral } from "./embeddings";
import { buildCaseProfile, identityHash, passportIdentity } from "./profile";
import { listDocuments } from "./store";

export interface SimilarCase {
  case_id: string;
  similarity: number;
  profile: string;
}

const MIN_SIMILARITY = Number(process.env.SIMILAR_MIN_SIMILARITY ?? "0.80");

function log(event: string, fields: Record<string, unknown>): void {
  // Shapes and counts only, like the extractor's logging.
  console.log(JSON.stringify({ event, ...fields }));
}

/**
 * Rebuilds one case's profile row. Embeds only when the profile text changed,
 * so repeated confirms on the same case cost nothing.
 */
export async function refreshCaseProfile(caseId: string): Promise<void> {
  try {
    const [docsAll, meta] = await Promise.all([listDocuments(), getCaseMeta(caseId)]);
    const docs = docsAll.filter((d) => d.case_id === caseId);
    const m = meta ?? defaultMeta(caseId);
    const profile = buildCaseProfile(m, docs);
    const salt = process.env.IDENTITY_HASH_SALT ?? "";
    const identity = passportIdentity(docs);
    const hash = salt && identity ? identityHash(identity, salt) : null;

    // A confirmed passport alone gives an identity hash but no profile text:
    // keep the row (duplicate detection works), just without a vector.
    if (!profile && !hash) {
      await pool().query("DELETE FROM case_profiles WHERE case_id = $1", [caseId]);
      log("profile_refresh", { status: "cleared", case_id: caseId });
      return;
    }
    const { rows } = await pool().query<{ profile: string; has_embedding: boolean }>("SELECT profile, embedding IS NOT NULL AS has_embedding FROM case_profiles WHERE case_id = $1", [caseId]);
    const unchanged = rows[0]?.profile === (profile ?? "") && (rows[0]?.has_embedding || !profile);
    let embedding: string | null = null;
    let model: string | null = null;
    if (profile && !unchanged) {
      const r = await embedTexts([profile], "document");
      embedding = toVectorLiteral(r.vectors[0]);
      model = r.model;
    }
    await pool().query(
      `INSERT INTO case_profiles (case_id, profile, identity_hash, embedding, embedding_model, updated_at)
       VALUES ($1, $2, $3, $4::vector, $5, now())
       ON CONFLICT (case_id) DO UPDATE SET profile = EXCLUDED.profile, identity_hash = EXCLUDED.identity_hash,
         embedding = CASE WHEN EXCLUDED.profile = '' THEN NULL ELSE COALESCE(EXCLUDED.embedding, case_profiles.embedding) END,
         embedding_model = COALESCE(EXCLUDED.embedding_model, case_profiles.embedding_model), updated_at = now()`,
      [caseId, profile ?? "", hash, embedding, model],
    );
    log("profile_refresh", { status: !profile ? "identity_only" : unchanged ? "unchanged" : "embedded", case_id: caseId, has_identity: hash !== null });
  } catch (e) {
    log("profile_refresh", { status: "failed", case_id: caseId, error: e instanceof Error ? e.message.slice(0, 120) : "unknown" });
  }
}

export async function findSimilarCases(caseId: string, limit = 5): Promise<SimilarCase[]> {
  const { rows } = await pool().query<{ case_id: string; profile: string; similarity: number }>(
    `SELECT p.case_id, p.profile, 1 - (p.embedding <=> q.embedding) AS similarity
     FROM case_profiles p JOIN case_profiles q ON q.case_id = $1
     WHERE p.case_id <> $1 AND p.embedding IS NOT NULL AND q.embedding IS NOT NULL
     ORDER BY p.embedding <=> q.embedding LIMIT $2`,
    [caseId, limit],
  );
  return rows.map((r) => ({ ...r, similarity: Number(r.similarity) })).filter((r) => r.similarity >= MIN_SIMILARITY);
}

/** Other cases whose confirmed passport identity hash equals this case's. */
export async function findDuplicateStudents(caseId: string): Promise<string[]> {
  const { rows } = await pool().query<{ case_id: string }>(
    `SELECT o.case_id FROM case_profiles me JOIN case_profiles o ON o.identity_hash = me.identity_hash AND o.case_id <> me.case_id
     WHERE me.case_id = $1 AND me.identity_hash IS NOT NULL ORDER BY o.case_id`,
    [caseId],
  );
  return rows.map((r) => r.case_id);
}

/** Rebuild every case's profile. Used after an import or a salt change. */
export async function reindexAllProfiles(): Promise<{ cases: number }> {
  const [metas, docs] = await Promise.all([listCaseMeta(), listDocuments()]);
  const ids = new Set<string>([...metas.keys(), ...docs.map((d) => d.case_id)]);
  for (const id of ids) await refreshCaseProfile(id);
  return { cases: ids.size };
}
