import "server-only";

/** With AGENT_URL the agent service says whether a model is connected; otherwise fall back to the env. */
export async function agentHasModel(): Promise<boolean> {
  const url = process.env.AGENT_URL;
  if (!url) return process.env.AI_PROVIDER === "bedrock" || Boolean(process.env.ANTHROPIC_API_KEY);
  try {
    const r = await fetch(`${url}/healthz`, { cache: "no-store", signal: AbortSignal.timeout(2500) });
    const j = (await r.json()) as { model_connected?: unknown };
    return j.model_connected === true;
  } catch {
    return false;
  }
}
