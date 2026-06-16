import { flags } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import type { DbBackend } from "@/lib/db/types";
import { FileBackend } from "@/lib/db/file-backend";
import { MongooseBackend } from "@/lib/db/mongoose-backend";

const log = createLogger("db");

const globalForDb = globalThis as unknown as { __db__?: DbBackend };

function createBackend(): DbBackend {
  if (flags.hasMongo) {
    log.info("Using MongoDB backend");
    return new MongooseBackend();
  }
  log.warn(
    "MONGODB_URI not set — using file-based datastore at ./storage/db (development only)",
  );
  return new FileBackend();
}

export const db: DbBackend = globalForDb.__db__ ?? createBackend();
globalForDb.__db__ = db;

export type { DbBackend };
export * from "@/lib/db/types";
