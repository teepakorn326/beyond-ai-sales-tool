// Case metadata: what the document store does not hold. One row per case in
// the `cases` table. The agent layer reads the same table (agent/agent/pg.py),
// so the column names are the keys it expects; the web tier adds intake,
// assignee, acknowledged warnings and timestamps, which the agent ignores.

import "server-only";

import type { CaseMeta } from "./case-status";
import { pool, withTx } from "./db";

export const CASE_ID_RE = /^[A-Za-z0-9-]{1,40}$/;

interface CaseRow {
  case_id: string;
  country: string;
  course_end_date: string | null;
  submission_target: string | null;
  program_id: string | null;
  status: string;
  intake: string | null;
  assignee: string | null;
  acknowledged: Record<string, string> | null;
  created_at: Date;
  updated_at: Date;
}

export function defaultMeta(caseId: string, now = new Date().toISOString()): CaseMeta {
  return {
    case_id: caseId,
    country: "AU",
    course_end_date: null,
    submission_target: null,
    program_id: null,
    status: "open",
    intake: null,
    assignee: null,
    acknowledged: {},
    created_at: now,
    updated_at: now,
  };
}

function hydrate(r: CaseRow): CaseMeta {
  return {
    case_id: r.case_id,
    country: r.country === "NZ" ? "NZ" : "AU",
    course_end_date: r.course_end_date,
    submission_target: r.submission_target,
    program_id: r.program_id,
    status: r.status === "archived" ? "archived" : "open",
    intake: r.intake,
    assignee: r.assignee,
    acknowledged: r.acknowledged && typeof r.acknowledged === "object" ? r.acknowledged : {},
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

const COLS = "case_id, country, course_end_date, submission_target, program_id, status, intake, assignee, acknowledged, created_at, updated_at";

export async function listCaseMeta(): Promise<Map<string, CaseMeta>> {
  const { rows } = await pool().query<CaseRow>(`SELECT ${COLS} FROM cases`);
  return new Map(rows.map((r) => [r.case_id, hydrate(r)]));
}

export async function getCaseMeta(caseId: string): Promise<CaseMeta | null> {
  if (!CASE_ID_RE.test(caseId)) return null;
  const { rows } = await pool().query<CaseRow>(`SELECT ${COLS} FROM cases WHERE case_id = $1`, [caseId]);
  return rows[0] ? hydrate(rows[0]) : null;
}

export type CasePatch = Partial<Pick<CaseMeta, "country" | "course_end_date" | "submission_target" | "program_id" | "status" | "intake" | "assignee" | "acknowledged">>;

export async function upsertCaseMeta(caseId: string, patch: CasePatch): Promise<CaseMeta> {
  if (!CASE_ID_RE.test(caseId)) throw new Error("Invalid case id");
  return withTx(async (c) => {
    const { rows } = await c.query<CaseRow>(`SELECT ${COLS} FROM cases WHERE case_id = $1 FOR UPDATE`, [caseId]);
    const cur = rows[0] ? hydrate(rows[0]) : defaultMeta(caseId);
    const next: CaseMeta = { ...cur, ...patch, case_id: caseId, created_at: cur.created_at, updated_at: new Date().toISOString() };
    const { rows: saved } = await c.query<CaseRow>(
      `INSERT INTO cases (${COLS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
       ON CONFLICT (case_id) DO UPDATE SET country = EXCLUDED.country, course_end_date = EXCLUDED.course_end_date,
         submission_target = EXCLUDED.submission_target, program_id = EXCLUDED.program_id, status = EXCLUDED.status,
         intake = EXCLUDED.intake, assignee = EXCLUDED.assignee, acknowledged = EXCLUDED.acknowledged, updated_at = EXCLUDED.updated_at
       RETURNING ${COLS}`,
      [
        caseId,
        next.country,
        next.course_end_date,
        next.submission_target,
        next.program_id,
        next.status,
        next.intake,
        next.assignee,
        JSON.stringify(next.acknowledged),
        next.created_at,
        next.updated_at,
      ],
    );
    return hydrate(saved[0]);
  });
}
