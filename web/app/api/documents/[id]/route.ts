import { NextResponse } from "next/server";

import { getDocument, StoreError } from "../../../lib/store";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const doc = await getDocument(id);
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    return NextResponse.json(doc);
  } catch (e) {
    if (e instanceof StoreError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
