import { NextRequest, NextResponse } from "next/server";

import { applyConfirmations, ReviewError, type FieldConfirmation } from "../../../../lib/review";
import { StoreError, updateDocument } from "../../../../lib/store";
import type { FieldValue } from "../../../../types";

export const runtime = "nodejs";

function isFieldValue(v: unknown): v is FieldValue {
  return v === null || ["string", "number", "boolean"].includes(typeof v);
}

function parseBody(raw: unknown): FieldConfirmation[] | null {
  if (raw === null || typeof raw !== "object" || !("fields" in raw)) return null;
  const fields = raw.fields;
  if (!Array.isArray(fields) || fields.length === 0) return null;
  const out: FieldConfirmation[] = [];
  for (const f of fields as unknown[]) {
    if (f === null || typeof f !== "object" || !("name" in f) || !("value" in f)) return null;
    if (typeof f.name !== "string" || !isFieldValue(f.value)) return null;
    out.push({ name: f.name, value: f.value });
  }
  return out;
}

/**
 * Confirms one or more fields. One field for a medium- or low-confidence
 * value, several for the high-confidence batch. There is deliberately no way
 * to confirm a document wholesale: the caller must name each field.
 *
 * Writes go to `confirmations` and, once complete, `confirmed_json`. The
 * store refuses any change to `extracted_json`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fields = parseBody(await req.json().catch(() => null));
  if (!fields) {
    return NextResponse.json({ error: "fields must be a list of {name, value}" }, { status: 400 });
  }

  const now = new Date().toISOString();
  try {
    const doc = await updateDocument(id, (d) => applyConfirmations(d, fields, now));
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    return NextResponse.json(doc);
  } catch (e) {
    if (e instanceof ReviewError || e instanceof StoreError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
