import { NextRequest, NextResponse } from "next/server";

import { CASE_ID_RE, getCaseMeta, upsertCaseMeta } from "../../../../lib/cases";

export const runtime = "nodejs";

/**
 * A person has looked at a rule WARNING and confirmed it is not a problem
 * (for R1: the romanisation variant is the same student). Recorded on the
 * case with a timestamp; it never changes a stored document value, and it
 * has no effect on a BLOCK.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CASE_ID_RE.test(id)) return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  const body: unknown = await req.json().catch(() => null);
  const ruleId = body !== null && typeof body === "object" && "rule_id" in body ? body.rule_id : null;
  if (typeof ruleId !== "string" || !/^R\d{1,2}$/.test(ruleId)) {
    return NextResponse.json({ error: "rule_id is required" }, { status: 400 });
  }
  const undo = body !== null && typeof body === "object" && "undo" in body && body.undo === true;
  const cur = (await getCaseMeta(id))?.acknowledged ?? {};
  const next = { ...cur };
  if (undo) delete next[ruleId];
  else next[ruleId] = new Date().toISOString();
  return NextResponse.json(await upsertCaseMeta(id, { acknowledged: next }));
}
