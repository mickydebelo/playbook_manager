import { z } from "zod";

/**
 * Environment configuration, validated once. Import `env` from here instead of reading process.env.
 * A misconfigured deployment fails at boot rather than on first request.
 */
const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().default(""),
  PGLITE_DATA_DIR: z.string().default("./.data/pglite"),

  SESSION_SECRET: z.string().min(16).default("dev-only-secret-change-me-please-32chars"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  AUTH_PROVIDER: z.enum(["dev", "oidc"]).default("dev"),
  DEV_LOGIN_ENABLED: boolish.default(true),
  OIDC_ISSUER: z.string().default(""),
  OIDC_CLIENT_ID: z.string().default(""),
  OIDC_CLIENT_SECRET: z.string().default(""),
  OIDC_REDIRECT_URI: z.string().default("http://localhost:3000/api/auth/callback"),
  BOOTSTRAP_ADMIN_EMAILS: z.string().default(""),

  APS_BASE_URL: z.string().url().default("https://developer-stg.api.autodesk.com"),
  APS_CLIENT_ID: z.string().default(""),
  APS_CLIENT_SECRET: z.string().default(""),
  APS_MODEL_FAST: z.string().default("amp-pid-1728-anthropic-claude-haiku-4-5-20251001-v1-0"),
  APS_MODEL_QUALITY: z.string().default("amp-pid-1728-anthropic-claude-opus-4-1-20250805-v1-0"),
  APS_EMBED_MODEL: z.string().default("amp-pid-1728-amazon-titan-embed-text-v2-0"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./.data/storage"),
  S3_BUCKET: z.string().default(""),
  S3_REGION: z.string().default(""),
  S3_ENDPOINT: z.string().default(""),

  JOBS_MODE: z.enum(["inline", "worker"]).default("inline"),

  /** Browser binary used to print the PDF export. Falls back to the usual macOS and Linux paths. */
  CHROME_PATH: z.string().default(""),

  /** Watched directory for local-folder ingest. Never derived from a request. */
  INGEST_LOCAL_DIR: z.string().default("./.data/ingest"),
  /** SharePoint ingest through Microsoft Graph; needs Sites.ReadWrite.All and Files.ReadWrite.All. */
  SHAREPOINT_TENANT_ID: z.string().default(""),
  SHAREPOINT_CLIENT_ID: z.string().default(""),
  SHAREPOINT_CLIENT_SECRET: z.string().default(""),
  SHAREPOINT_DRIVE_ID: z.string().default(""),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production") {
    if (env.SESSION_SECRET.startsWith("dev-only")) throw new Error("SESSION_SECRET must be set in production");
    if (env.AUTH_PROVIDER === "dev") throw new Error("AUTH_PROVIDER=dev is not allowed in production");
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required in production");
  }
  cached = env;
  return env;
}

/** Test helper: forget the cached environment so a test can change process.env. */
export function resetEnvCache(): void {
  cached = null;
}

export function bootstrapAdminEmails(): Set<string> {
  return new Set(
    getEnv()
      .BOOTSTRAP_ADMIN_EMAILS.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}
