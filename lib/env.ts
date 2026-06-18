/**
 * Centralised, typed access to environment variables.
 *
 * This module never throws on import: the app is designed to run with graceful
 * degradation when optional keys are missing. Use the `has*` helpers to detect
 * which integrations are configured and to report missing credentials on jobs.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

const DEV_DEFAULT_PASSWORD = "autodemo";
const DEV_DEFAULT_AUTH_SECRET = "dev-only-auth-secret-change-me";
const DEV_DEFAULT_ENCRYPTION_KEY = "dev-only-encryption-key-change-me-32b";

export const env = {
  mongodbUri: read("MONGODB_URI"),

  openaiApiKey: read("OPENAI_API_KEY"),
  openaiModel: read("OPENAI_MODEL") ?? "gpt-4o-mini",
  openaiModelWorkflow:
    read("OPENAI_MODEL_WORKFLOW") ?? read("OPENAI_MODEL") ?? "gpt-4o-mini",
  openaiModelScript:
    read("OPENAI_MODEL_SCRIPT") ?? read("OPENAI_MODEL") ?? "gpt-4o-mini",
  openaiModelRecord:
    read("OPENAI_MODEL_RECORD") ?? read("OPENAI_MODEL") ?? "gpt-4o-mini",
  recordAiMode: (read("RECORD_AI_MODE") ?? "modal_steps") as
    | "failure_only"
    | "modal_steps"
    | "all_interactive",
  recordUseVision: read("RECORD_USE_VISION") !== "false",
  uiSettleMs: Number(read("UI_SETTLE_MS") ?? "1500"),
  stepEndBufferMs: Number(read("STEP_END_BUFFER_MS") ?? "800"),
  clipTrimBias: read("CLIP_TRIM_BIAS") ?? "tail",

  adminPassword: read("ADMIN_PASSWORD") ?? DEV_DEFAULT_PASSWORD,
  authSecret: read("AUTH_SECRET") ?? DEV_DEFAULT_AUTH_SECRET,
  encryptionKey: read("ENCRYPTION_KEY") ?? DEV_DEFAULT_ENCRYPTION_KEY,

  elevenLabsApiKey: read("ELEVENLABS_API_KEY"),

  blobToken: read("BLOB_READ_WRITE_TOKEN"),
  storageDriver: (read("STORAGE_DRIVER") ?? "local") as "local" | "blob",
  blobAccess: (read("BLOB_ACCESS") === "public" ? "public" : "private") as
    | "public"
    | "private",

  workerPollInterval: Number(read("WORKER_POLL_INTERVAL") ?? "3000"),
  appBaseUrl: read("APP_BASE_URL") ?? "http://localhost:3000",

  remotionTimeoutMs: Number(read("REMOTION_TIMEOUT_MS") ?? "120000"),
  remotionConcurrency: read("REMOTION_CONCURRENCY")
    ? Number(read("REMOTION_CONCURRENCY"))
    : undefined,
  remotionOffthreadCacheBytes:
    Number(read("REMOTION_OFFTHREAD_CACHE_MB") ?? "256") * 1024 * 1024,

  recordViewportWidth: Number(read("RECORD_VIEWPORT_WIDTH") ?? "1024"),
  recordViewportHeight: Number(read("RECORD_VIEWPORT_HEIGHT") ?? "640"),
  playwrightChromiumArgs: read("PLAYWRIGHT_CHROMIUM_ARGS")
    ?.split(/\s+/)
    .filter(Boolean),

  nodeEnv: read("NODE_ENV") ?? "development",
};

export const flags = {
  hasMongo: Boolean(env.mongodbUri),
  hasOpenAI: Boolean(env.openaiApiKey),
  hasElevenLabs: Boolean(env.elevenLabsApiKey),
  hasBlob: Boolean(env.blobToken),
  hasAdminPassword: read("ADMIN_PASSWORD") !== undefined,
  hasAuthSecret: read("AUTH_SECRET") !== undefined,
  hasEncryptionKey: read("ENCRYPTION_KEY") !== undefined,
  isProduction: env.nodeEnv === "production",
};

/** Human-readable list of integrations that are NOT configured. */
export function describeMissing(): string[] {
  const missing: string[] = [];
  if (!flags.hasMongo) missing.push("MONGODB_URI");
  if (!flags.hasOpenAI) missing.push("OPENAI_API_KEY");
  if (!flags.hasElevenLabs) missing.push("ELEVENLABS_API_KEY");
  if (env.storageDriver === "blob" && !flags.hasBlob)
    missing.push("BLOB_READ_WRITE_TOKEN");
  return missing;
}
