import { NextRequest, NextResponse } from "next/server";

import { getImage, StoreError } from "../../../../lib/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = Number(req.nextUrl.searchParams.get("page") ?? "0");
  if (!Number.isInteger(page) || page < 0) return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  try {
    const img = await getImage(id, page);
    if (!img) return NextResponse.json({ error: "Image not found" }, { status: 404 });
    return new NextResponse(img.bytes, {
      headers: {
        "Content-Type": img.content_type,
        // Identity documents: never let a shared cache keep a copy.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof StoreError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
