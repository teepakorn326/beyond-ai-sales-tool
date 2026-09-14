import { NextRequest, NextResponse } from "next/server";

import { StoreError, updateDocument } from "../../../../lib/store";
import { FIELDS_FOR, type RequestKind } from "../../../../types";

export const runtime = "nodejs";

const KINDS: readonly RequestKind[] = ["new_photo", "new_document"];

/**
 * Records an ask for the student: a clearer photo of the same document, or a
 * reissued document. These are different requests from the student's side,
 * so they are different kinds here.
 *
 * Nothing is sent. The record is internal and reversible; contacting the
 * student is a person's job and stays outside this system.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body: unknown = await req.json().catch(() => null);
  if (body === null || typeof body !== "object" || !("kind" in body)) {
    return NextResponse.json({ error: "kind is required" }, { status: 400 });
  }
  const kind = body.kind;
  if (typeof kind !== "string" || !(KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "kind must be new_photo or new_document" }, { status: 400 });
  }
  const field = "field" in body && typeof body.field === "string" ? body.field : null;

  try {
    const doc = await updateDocument(id, (d) => {
      if (field !== null && !FIELDS_FOR[d.doc_type].includes(field)) {
        throw new StoreError(`No field ${field} on a ${d.doc_type}`);
      }
      return {
        ...d,
        requests: [
          ...d.requests,
          { kind: kind as RequestKind, field, created_at: new Date().toISOString() },
        ],
      };
    });
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    return NextResponse.json(doc);
  } catch (e) {
    if (e instanceof StoreError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
