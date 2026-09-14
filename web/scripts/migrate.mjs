#!/usr/bin/env node
// Apply db/schema.sql to DATABASE_URL. Idempotent; safe to run every start.
//   node scripts/migrate.mjs [path/to/schema.sql]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? path.resolve(here, "..", "..", "db", "schema.sql");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
// pg lets sslmode= in the URL override an explicit ssl option: strip it and configure TLS here.
const u = new URL(url);
const sslmode = u.searchParams.get("sslmode");
u.searchParams.delete("sslmode");
const ssl =
  sslmode && sslmode !== "disable"
    ? process.env.PG_CA_CERT_PATH
      ? { ca: readFileSync(process.env.PG_CA_CERT_PATH, "utf8"), rejectUnauthorized: true }
      : { rejectUnauthorized: false }
    : undefined;
const client = new pg.Client({ connectionString: u.toString(), ssl });
await client.connect();
try {
  await client.query(readFileSync(file, "utf8"));
  const { rows } = await client.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
  console.log(`schema applied from ${path.relative(process.cwd(), file)}: ${rows[0].n} tables`);
} finally {
  await client.end();
}
