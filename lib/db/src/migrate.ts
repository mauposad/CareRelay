import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * Applies the generated SQL migrations. Runs on API start so a fresh clone
 * (or a wiped embedded database) comes up with a correct schema and no manual
 * step. Idempotent: applied migrations are recorded and skipped.
 *
 * Deliberately a small runner rather than drizzle-kit's, because the API is
 * bundled by esbuild and reads the .sql files from disk at runtime.
 */
function migrationsDir(): string {
  const configured = process.env.MIGRATIONS_DIR;
  if (configured) return path.resolve(configured);

  // Walk up from the working directory to find the repo's migrations.
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(dir, "lib/db/drizzle");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "Could not locate lib/db/drizzle. Set MIGRATIONS_DIR to the migrations folder.",
  );
}

export async function runMigrations(): Promise<{ applied: string[] }> {
  const dir = migrationsDir();

  await db.execute(sql`create table if not exists __carerelay_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`);

  const done = new Set(
    (await db.execute(sql`select name from __carerelay_migrations`)).rows.map(
      (row) => String((row as { name: unknown }).name),
    ),
  );

  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const contents = fs.readFileSync(path.join(dir, file), "utf8");
    const statements = contents
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await db.execute(sql.raw(statement));
    }
    await db.execute(
      sql`insert into __carerelay_migrations (name) values (${file})`,
    );
    applied.push(file);
  }

  return { applied };
}
