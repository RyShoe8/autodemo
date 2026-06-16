/**
 * Standalone worker entry point.
 *
 * Loads environment variables from `.env` BEFORE importing any module that reads
 * `process.env`, then starts the polling loop. Run with: `npm run worker`.
 */

async function main() {
  // Node 20.12+/21+ exposes process.loadEnvFile. Load .env if present.
  try {
    (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(
      ".env",
    );
  } catch {
    // No .env file — rely on real environment variables.
  }

  const { runWorker } = await import("./loop");
  await runWorker();
}

main().catch((err) => {
  console.error("Worker crashed:", err);
  process.exit(1);
});
