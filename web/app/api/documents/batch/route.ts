import { NextRequest, NextResponse } from "next/server";

import { ExtractorError } from "../../../lib/extractor";
import { fileParts, IMAGE_TYPES, intakeBatch, MAX_BYTES } from "../../../lib/intake";

export const runtime = "nodejs";

function bad(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Upload every image for a case at once, in any order. The extractor says
 * what each page is, code groups pages into documents, each confident group
 * is extracted into its own review record, and the rest are held for a
 * person to sort. Nothing here confirms a field.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const caseId = form.get("case_id");
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  if (typeof caseId !== "string" || !/^[A-Za-z0-9-]{1,40}$/.test(caseId)) {
    return bad("Case id may contain only letters, digits and dashes, up to 40 characters");
  }
  if (files.length === 0) return bad("Attach at least one file");
  if (files.length > 40) return bad("At most 40 files per upload");
  for (const f of files) {
    if (!IMAGE_TYPES.has(f.type)) return bad(`${f.name}: only PNG, JPEG, WebP, HEIC or PDF are accepted`);
    if (f.size > MAX_BYTES) return bad(`${f.name}: file is larger than 5MB`);
  }

  try {
    const result = await intakeBatch(caseId, await fileParts(files));
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof ExtractorError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
