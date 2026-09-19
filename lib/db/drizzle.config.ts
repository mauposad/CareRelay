import { defineConfig } from "drizzle-kit";
import path from "path";

/**
 * `generate` produces SQL migrations and needs no database. `push` talks to a
 * live Postgres and does, so the URL is only required for that path.
 */
export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  out: path.join(__dirname, "./drizzle"),
  dialect: "postgresql",
  ...(process.env.DATABASE_URL
    ? { dbCredentials: { url: process.env.DATABASE_URL } }
    : {}),
});
