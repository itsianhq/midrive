import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

// Treat `KEY=` in .env files as unset
const optionalUrl = z.preprocess((v) => (v === "" ? undefined : v), z.url().optional());

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().min(1),

  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  // Public URL of this API server, e.g. https://api.drive.example.org
  BETTER_AUTH_URL: z.url(),
  // Comma-separated origins of the web app, allowed for CORS + auth, e.g. https://drive.example.org
  TRUSTED_ORIGINS: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean)),
  // Comma-separated IPs/CIDRs of reverse proxies in front of the API, so rate limits see the real client IP
  TRUSTED_PROXIES: z
    .string()
    .default("")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),

  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().default("us-east-1"),
  S3_ENDPOINT: optionalUrl,
  // Endpoint used when signing URLs for the browser, if it differs from S3_ENDPOINT
  S3_PUBLIC_ENDPOINT: optionalUrl,
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: bool.default(false),

  // Largest single file in bytes, applied even to users without a quota. Defaults to S3's 5 TiB limit.
  MAX_UPLOAD_SIZE: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce
      .number()
      .int()
      .positive()
      .max(5 * 1024 ** 4)
      .default(5 * 1024 ** 4),
  ),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
