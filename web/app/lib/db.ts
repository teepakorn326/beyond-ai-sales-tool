// One connection pool for the web tier. Lazy, so `next build` (which has no
// database) never opens a connection, and cached on globalThis so Next's dev
// server does not open a new pool on every hot reload.

import "server-only";

import { readFileSync } from "node:fs";
import { Pool, types, type PoolClient, type PoolConfig } from "pg";

// DATE columns come back as "YYYY-MM-DD" strings, never JS Date objects:
// ISO 8601 everywhere, and no timezone shifting a date of birth by a day.
types.setTypeParser(1082, (v) => v);

/** SQLSTATE raised by the documents_extracted_json_immutable trigger. */
export const IMMUTABLE_SQLSTATE = "VDC01";

const g = globalThis as unknown as { __vdcPool?: Pool };

/**
 * pg lets `sslmode=` in the URL override an explicit `ssl` option, so the
 * mode is taken out of the URL and TLS is configured here: with
 * PG_CA_CERT_PATH (the RDS CA bundle) the server certificate is verified;
 * without it the connection is encrypted but the certificate is not checked.
 */
export function poolConfig(url: string): PoolConfig {
  const u = new URL(url);
  const mode = u.searchParams.get("sslmode");
  u.searchParams.delete("sslmode");
  const cfg: PoolConfig = { connectionString: u.toString(), max: 5 };
  if (mode && mode !== "disable") {
    const ca = process.env.PG_CA_CERT_PATH;
    cfg.ssl = ca ? { ca: readFileSync(ca, "utf8"), rejectUnauthorized: true } : { rejectUnauthorized: false };
  }
  return cfg;
}

export function pool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return (g.__vdcPool ??= new Pool(poolConfig(url)));
}

export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

export function pgCode(e: unknown): string | null {
  return e !== null && typeof e === "object" && "code" in e && typeof e.code === "string" ? e.code : null;
}
