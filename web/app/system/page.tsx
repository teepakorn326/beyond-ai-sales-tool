import type { Metadata } from "next";

import { Pill } from "../components/badges";
import { PageHeader, TopBar } from "../components/shell";
import { loadAllSummaries } from "../lib/checks";
import { pool } from "../lib/db";
import { timeAgo } from "../lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "System" };

async function probe(url: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(2500) });
    return { ok: res.ok, detail: res.ok ? `HTTP ${res.status}` : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error && e.name === "TimeoutError" ? "No answer within 2.5 s" : "Not reachable" };
  }
}

async function probeDb(): Promise<{ ok: boolean; detail: string }> {
  try {
    const { rows } = await pool().query<{ v: string; vec: string | null }>(
      "SELECT version() AS v, (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS vec",
    );
    return { ok: true, detail: `${rows[0].v.split(" ").slice(0, 2).join(" ")} · pgvector ${rows[0].vec ?? "missing"}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 80) : "Not reachable" };
  }
}

export default async function SystemPage() {
  const extractor = process.env.EXTRACTOR_URL ?? "http://localhost:8000";
  const rules = process.env.RULES_SERVICE_URL ?? "http://localhost:8081";
  const agent = process.env.AGENT_URL ?? null;
  const [ex, ru, db, ag, summaries] = await Promise.all([
    probe(`${extractor}/healthz`),
    probe(`${rules}/healthz`),
    probeDb(),
    agent ? probe(`${agent}/healthz`) : Promise.resolve({ ok: false, detail: "AGENT_URL not set; assistant runs as a CLI" }),
    loadAllSummaries().catch(() => []),
  ]);
  const lastCheck = summaries.map((s) => s.checks).filter((c): c is NonNullable<typeof c> => c !== null).sort((a, b) => b.checked_at_ms - a.checked_at_ms)[0] ?? null;
  const docs = summaries.reduce((n, s) => n + s.slots.filter((x) => x.doc).length, 0);
  const held = summaries.reduce((n, s) => n + s.held.length, 0);

  const Service = ({ name, url, r, note }: { name: string; url: string; r: { ok: boolean; detail: string }; note: string }) => (
    <div className={`card compact stripe ${r.ok ? "ok" : "err"}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="value">{name}</span>
        {r.ok ? (
          <Pill tone="ok" icon="check">
            Reachable
          </Pill>
        ) : (
          <Pill tone="err" icon="block">
            Down
          </Pill>
        )}
      </div>
      <div className="muted small mono" style={{ marginTop: 4 }}>
        {url} · {r.detail}
      </div>
      <div className="t2 small" style={{ marginTop: 4 }}>{note}</div>
    </div>
  );

  return (
    <>
      <TopBar crumbs={[{ label: "System" }]} />
      <main className="content">
        <PageHeader title="System" subtitle="Services this review tool depends on, and what the last run of the rules engine reported." />
        <div className="grid-2">
          <Service name="Extractor" url={extractor} r={ex} note="Classifies pages and extracts fields. Probabilistic; measured by the extraction evals. Also proxies /check to the rules engine." />
          <Service name="Rules engine" url={rules} r={ru} note="Deterministic R1–R5 consistency checks on confirmed data only. Never calls a model." />
          <Service name="Database" url={(process.env.DATABASE_URL ?? "DATABASE_URL not set").replace(/\/\/.*@/, "//…@")} r={db} note="Postgres with pgvector: documents, cases, PII-free case profiles and the policy index. Images live in S3; only keys are stored." />
          <Service name="Agent service" url={agent ?? "—"} r={ag} note="LangGraph assistant over HTTP. Proposals that reach a student wait for approval here." />
        </div>
        <div className="grid-3">
          <div className="card compact">
            <div className="label">Ruleset</div>
            <div className="value mono" style={{ fontSize: 15, marginTop: 2 }}>{lastCheck?.ruleset_version ?? "—"}</div>
            <div className="muted small" style={{ marginTop: 4 }}>{lastCheck ? `Last run ${timeAgo(new Date(lastCheck.checked_at_ms).toISOString())}` : "No check has run yet"}</div>
          </div>
          <div className="card compact">
            <div className="label">Cases on file</div>
            <div className="value" style={{ fontSize: 15, marginTop: 2 }}>{summaries.length}</div>
            <div className="muted small" style={{ marginTop: 4 }}>
              {docs} document{docs === 1 ? "" : "s"} · {held} held for classification
            </div>
          </div>
          <div className="card compact">
            <div className="label">Model</div>
            <div className="value" style={{ fontSize: 15, marginTop: 2 }}>{process.env.ANTHROPIC_API_KEY ? (process.env.ANTHROPIC_MODEL ?? "configured") : "Not configured here"}</div>
            <div className="muted small" style={{ marginTop: 4 }}>The extractor holds the key; the assistant runs deterministic nodes only without one.</div>
          </div>
        </div>
        <div className="card compact">
          <div className="overline">What the numbers mean</div>
          <div className="t2" style={{ marginTop: 4 }}>
            Extraction accuracy is measured offline against <span className="mono">extractor/evals/thresholds.yaml</span>, and the agent against <span className="mono">agent/evals/thresholds.yaml</span>. Those floors are the contract: a regression fails the deploy rather than lowering the floor. Run <span className="mono">./run.sh test</span> to see the current numbers.
          </div>
        </div>
      </main>
    </>
  );
}
