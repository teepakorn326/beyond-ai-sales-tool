// Embeddings for the web tier come from the extractor's /embed route, so the
// web container never holds a model credential. Texts must be PII-free (see
// profile.ts); this module sends them and validates the shape that comes back.

import "server-only";

import { ExtractorError } from "./extractor";

export const EMBEDDING_DIMS = Number(process.env.EMBEDDING_DIMS ?? "1024");
const BASE = process.env.EXTRACTOR_URL ?? "http://localhost:8000";

export async function embedTexts(texts: string[], inputType: "document" | "query" = "document"): Promise<{ vectors: number[][]; model: string }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, input_type: inputType }),
      cache: "no-store",
    });
  } catch {
    throw new ExtractorError(502, "The extractor did not respond to /embed");
  }
  if (!res.ok) throw new ExtractorError(res.status, `embed failed: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { embeddings?: unknown; model?: unknown; dims?: unknown };
  if (!Array.isArray(body.embeddings) || body.embeddings.length !== texts.length) throw new ExtractorError(502, "embed returned the wrong number of vectors");
  const vectors = body.embeddings as number[][];
  if (vectors.some((v) => !Array.isArray(v) || v.length !== EMBEDDING_DIMS)) throw new ExtractorError(502, `embed returned vectors of the wrong width (expected ${EMBEDDING_DIMS})`);
  return { vectors, model: typeof body.model === "string" ? body.model : "unknown" };
}

/** pgvector literal for `$1::vector`. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toPrecision(8) : "0")).join(",")}]`;
}
