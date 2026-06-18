import { flags } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import type { DbBackend } from "@/lib/db/types";
import { FileBackend } from "@/lib/db/file-backend";
import { MongooseBackend } from "@/lib/db/mongoose-backend";
import { migrateLegacyData } from "@/lib/db/migrate";

const log = createLogger("db");

const globalForDb = globalThis as unknown as {
  __db__?: DbBackend;
  __dbMigrated__?: boolean;
};

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

async function ensureMigrated() {
  if (globalForDb.__dbMigrated__) return;
  try {
    await migrateLegacyData(db);
    globalForDb.__dbMigrated__ = true;
  } catch (err) {
    log.error("Legacy data migration failed", err);
  }
}

void ensureMigrated();

export type { DbBackend };
export * from "@/lib/db/types";
