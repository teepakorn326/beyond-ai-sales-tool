// Mirrors the Go structs in rules/. Kept hand-written rather than generated so
// that a change on either side shows up as a type error in review.

export type Verdict = "pass" | "warn" | "block";
export type CheckStatus = "ok" | "failed" | "pending";

export interface Check {
  rule_id: string;
  label: string;
  verdict: Verdict;
  status: CheckStatus;
  detail: string;
}

export interface CheckResult {
  case_id: string;
  can_proceed: boolean;
  ruleset_version: string;
  checks: Check[];
  checked_at_ms: number;
}

/** A pending check is not a passing check. Anything unresolved blocks. */
export function openCount(r: CheckResult): number {
  return r.checks.filter(
    (c) => c.verdict === "block" || c.status === "pending" || c.verdict === "warn",
  ).length;
}
