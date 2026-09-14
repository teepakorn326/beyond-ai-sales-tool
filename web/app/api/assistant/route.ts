import { execFile } from "node:child_process";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import type { AssistantReply, Decision, Proposal } from "../../lib/assistant-types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Two ways to reach the agent. With AGENT_URL set (docker compose) it is the
// FastAPI service in agent/agent/api.py: /ask starts a thread, /resume settles
// a pending approval on that thread. Without it (a checkout running
// ./run.sh dev) the CLI is spawned as a child process and a proposal is
// approved by re-running the question with --yes.

const AGENT_URL = process.env.AGENT_URL ?? "";
const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
const AGENT_DIR = process.env.AGENT_DIR ?? path.resolve(process.cwd(), "..", "agent");
const PYTHON = process.env.PYTHON ?? "python3";
const RULES_URL = process.env.RULES_SERVICE_URL ?? "http://localhost:8081";

const outsideScope = (answer: string) => /licensed|escalat|cannot help with|can't help with|outside/i.test(answer) && answer.length < 600;

// ---------------------------------------------------------------- HTTP agent

interface RunResponse {
  thread_id: string;
  answer: string | null;
  pending: { tool: string; args: Record<string, unknown>; reason: string; case_id: string | null } | null;
}

async function viaHttp(question: string, decision: Decision | null, threadId: string | null): Promise<AssistantReply> {
  const url = decision && threadId ? `${AGENT_URL}/resume` : `${AGENT_URL}/ask`;
  const body = decision && threadId ? { thread_id: threadId, approved: decision === "approve", approver: "web" } : { question, asked_by: "web" };
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(110_000) });
  } catch {
    return { answer: "", proposal: null, executed: false, outsideScope: false, unavailable: `The agent service is not reachable at ${AGENT_URL}`, thread_id: null };
  }
  if (res.status === 404 && decision) {
    return { answer: "", proposal: null, executed: false, outsideScope: false, unavailable: "That approval has expired (the agent restarted). Ask the question again.", thread_id: null };
  }
  if (!res.ok) {
    return { answer: "", proposal: null, executed: false, outsideScope: false, unavailable: `The agent service answered ${res.status}`, thread_id: null };
  }
  const r = (await res.json()) as RunResponse;
  const proposal: Proposal | null = r.pending ? { tool: r.pending.tool, args: JSON.stringify(r.pending.args), reason: r.pending.reason } : null;
  const answer = r.answer ?? "";
  return { answer, proposal, executed: decision === "approve" && !!answer, outsideScope: outsideScope(answer), unavailable: null, thread_id: r.thread_id };
}

// ---------------------------------------------------------------- CLI fallback

function parseProposal(stderr: string): Proposal | null {
  const m = /Proposal: (\S+) (.*)\nReason: (.*)/.exec(stderr);
  return m ? { tool: m[1], args: m[2].trim(), reason: m[3].trim() } : null;
}

function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      PYTHON,
      ["-m", "agent", ...args],
      { cwd: AGENT_DIR, timeout: 90_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, WEB_DATA_DIR: DATA_DIR, RULES_SERVICE_URL: RULES_URL, PYTHONUNBUFFERED: "1" } },
      (err, stdout, stderr) => {
        const code = err && typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : err ? 1 : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) + (err && !stderr ? `\n${err.message}` : "") });
      },
    );
  });
}

async function viaCli(question: string, approve: boolean): Promise<AssistantReply> {
  const args = [question];
  if (process.env.AI_PROVIDER !== "bedrock" && !process.env.ANTHROPIC_API_KEY) args.push("--no-model");
  if (approve) args.push("--yes");
  const { code, stdout, stderr } = await run(args);
  const answer = stdout.trim();
  const proposal = parseProposal(stderr);
  if (code !== 0 && !answer) {
    const hint = /No module named/.test(stderr)
      ? "The agent package is not installed. Run `pip install -e \".[dev]\"` inside agent/."
      : /Connection refused|ConnectError|rules/i.test(stderr)
        ? "The rules service is not reachable. Start it with `./run.sh dev`."
        : (stderr.trim().split("\n").at(-1) ?? "The assistant did not respond");
    return { answer: "", proposal: null, executed: false, outsideScope: false, unavailable: hint, thread_id: null };
  }
  return { answer, proposal: approve ? null : proposal, executed: approve && proposal !== null, outsideScope: outsideScope(answer), unavailable: null, thread_id: null };
}

// ---------------------------------------------------------------- route

export async function POST(req: NextRequest) {
  const body: unknown = await req.json().catch(() => null);
  if (body === null || typeof body !== "object") return NextResponse.json({ error: "Expected a JSON object" }, { status: 400 });
  const b = body as Record<string, unknown>;
  const question = typeof b.question === "string" ? b.question.trim() : "";
  const caseId = typeof b.case_id === "string" && /^[A-Za-z0-9-]{1,40}$/.test(b.case_id) ? b.case_id : null;
  const decision: Decision | null = b.decision === "approve" || b.approve === true ? "approve" : b.decision === "reject" ? "reject" : null;
  const threadId = typeof b.thread_id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(b.thread_id) ? b.thread_id : null;
  if (!question || question.length > 2000) return NextResponse.json({ error: "question is required (max 2000 characters)" }, { status: 400 });

  // The agent finds the case from the question text; make sure it is there.
  const q = caseId && !question.includes(caseId) ? `Case ${caseId}: ${question}` : question;
  const reply = AGENT_URL ? await viaHttp(q, decision, threadId) : await viaCli(q, decision === "approve");
  return NextResponse.json(reply);
}
