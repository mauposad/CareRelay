import { runMigrations } from "@workspace/db/migrate";
import { usingEmbeddedDatabase, embeddedDataDir } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { seedDemoData } from "./demo/seedDemo";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  if (usingEmbeddedDatabase) {
    logger.info({ dir: embeddedDataDir }, "No DATABASE_URL set — using the embedded database");
  }

  const { applied } = await runMigrations();
  if (applied.length > 0) logger.info({ applied }, "Applied database migrations");

  // Demo seeding is opt-in and never overwrites an existing circle.
  if (process.env["SEED_DEMO"] === "true") {
    const result = await seedDemoData();
    logger.info(result, "Demo data");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
