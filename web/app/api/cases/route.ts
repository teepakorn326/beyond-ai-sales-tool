import { after, NextRequest, NextResponse } from "next/server";

import { CASE_ID_RE, listCaseMeta, upsertCaseMeta, type CasePatch } from "../../lib/cases";
import { refreshCaseProfile } from "../../lib/similar";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function bad(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET() {
  return NextResponse.json([...(await listCaseMeta()).values()]);
}

/** Creates or updates a case's metadata. Documents are attached by the intake routes. */
export async function POST(req: NextRequest) {
  const body: unknown = await req.json().catch(() => null);
  if (body === null || typeof body !== "object") return bad("Expected a JSON object");
  const b = body as Record<string, unknown>;

  const caseId = b.case_id;
  if (typeof caseId !== "string" || !CASE_ID_RE.test(caseId)) {
    return bad("Case id may contain only letters, digits and dashes, up to 40 characters");
  }

  const patch: CasePatch = {};
  const dateOrNull = (k: "submission_target" | "course_end_date") => {
    if (!(k in b)) return null;
    const v = b[k];
    if (v === null || v === "") {
      patch[k] = null;
      return null;
    }
    if (typeof v !== "string" || !DATE_RE.test(v)) return `${k} must be YYYY-MM-DD`;
    patch[k] = v;
    return null;
  };
  for (const k of ["submission_target", "course_end_date"] as const) {
    const err = dateOrNull(k);
    if (err) return bad(err);
  }
  if ("intake" in b) {
    const v = b.intake;
    if (v === null || v === "") patch.intake = null;
    else if (typeof v === "string" && MONTH_RE.test(v)) patch.intake = v;
    else return bad("intake must be YYYY-MM");
  }
  if ("country" in b) {
    if (b.country !== "AU" && b.country !== "NZ") return bad("country must be AU or NZ");
    patch.country = b.country;
  }
  if ("assignee" in b) {
    const v = b.assignee;
    if (v === null || v === "") patch.assignee = null;
    else if (typeof v === "string" && v.length <= 80) patch.assignee = v.trim();
    else return bad("assignee must be a short name");
  }
  if ("status" in b) {
    if (b.status !== "open" && b.status !== "archived") return bad("status must be open or archived");
    patch.status = b.status;
  }

  const saved = await upsertCaseMeta(caseId, patch);
  if ("country" in patch || "intake" in patch || "program_id" in patch) after(() => refreshCaseProfile(caseId));
  return NextResponse.json(saved);
}
