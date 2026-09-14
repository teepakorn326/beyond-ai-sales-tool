import { NextRequest, NextResponse } from "next/server";

// Proxied through the server so the browser never holds a service URL or a
// credential, and so every check is logged in one place.
export async function POST(req: NextRequest) {
  const base = process.env.EXTRACTOR_URL ?? "http://localhost:8000";
  const body = await req.json();

  const res = await fetch(`${base}/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return NextResponse.json({ error: await res.text() }, { status: res.status });
  }
  return NextResponse.json(await res.json());
}
