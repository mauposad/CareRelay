import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const { Pool } = pg;

/**
 * CareRelay runs against a real Postgres when DATABASE_URL is set (Replit,
 * production). With no DATABASE_URL it falls back to PGlite, an embedded
 * Postgres that needs no server, so the demo can be cloned and run with one
 * command. Same SQL and same migrations either way.
 */
const url = process.env.DATABASE_URL;

export const usingEmbeddedDatabase = !url;

/** Where the embedded database keeps its files. Deleting this resets the demo. */
export const embeddedDataDir = path.resolve(
  process.env.EMBEDDED_DB_DIR ?? ".data/carerelay-db",
);

async function createClient() {
  if (url) {
    const pool = new Pool({ connectionString: url });
    return { db: drizzlePg(pool, { schema }), dialect: "postgres" as const, close: () => pool.end() };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  // PGlite's own mkdir is not recursive, so make sure the parent exists.
  fs.mkdirSync(embeddedDataDir, { recursive: true });
  const client = new PGlite(embeddedDataDir);
  return { db: drizzlePglite(client, { schema }), dialect: "pglite" as const, close: () => client.close() };
}

const client = await createClient();

export const db = client.db as ReturnType<typeof drizzlePg<typeof schema>>;
export const databaseDialect = client.dialect;
export const closeDatabase = client.close;

export * from "./schema";
