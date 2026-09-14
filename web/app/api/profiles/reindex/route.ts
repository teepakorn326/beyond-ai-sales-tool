import { NextResponse } from "next/server";

import { reindexAllProfiles } from "../../../lib/similar";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Rebuilds every PII-free case profile. Run after importing data or rotating IDENTITY_HASH_SALT. */
export async function POST() {
  return NextResponse.json(await reindexAllProfiles());
}
