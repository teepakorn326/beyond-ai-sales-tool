import { NextResponse } from "next/server";

// Fly checks this. It reports the extractor's reachability but does not fail
// on it: the web tier should stay up and say what is broken, rather than
// disappear and leave a visitor with a blank Fly error page.
export async function GET() {
  const base = process.env.EXTRACTOR_URL ?? "http://localhost:8000";
  let upstream = "unreachable";
  try {
    const r = await fetch(`${base}/healthz`, { cache: "no-store" });
    upstream = r.ok ? "ok" : `http_${r.status}`;
  } catch {
    /* upstream stays "unreachable" */
  }
  return NextResponse.json({ status: "ok", upstream });
}
