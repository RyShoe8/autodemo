import mongoose from "mongoose";
import { env, flags } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("mongodb");

/**
 * Cached connection helper. In serverless (Next.js) each invocation may reuse a
 * warm Lambda, so we cache the connection on the global object to avoid creating
 * a new pool on every request. The standalone worker keeps a single long-lived
 * connection.
 */

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = globalThis as unknown as {
  __mongoose__?: MongooseCache;
};

const cache: MongooseCache =
  globalForMongoose.__mongoose__ ?? { conn: null, promise: null };

globalForMongoose.__mongoose__ = cache;

export async function connectMongo(): Promise<typeof mongoose> {
  if (!flags.hasMongo) {
    throw new Error("MONGODB_URI is not configured");
  }
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    mongoose.set("strictQuery", true);
    cache.promise = mongoose
      .connect(env.mongodbUri as string, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000,
      })
      .then((m) => {
        log.info("Connected to MongoDB");
        return m;
      })
      .catch((err) => {
        cache.promise = null;
        log.error("MongoDB connection failed", err?.message ?? err);
        throw err;
      });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}
