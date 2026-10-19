import { z } from "zod";

/**
 * Environment contract. Parsed lazily so that `next build` works without
 * secrets present -- only code paths that actually need a value will throw,
 * and they throw with the variable name in the message.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),

  // Public base of the redirect host. This string is baked into printed codes,
  // so it can never change once a code has been printed.
  QR_BASE_URL: z.string().url().default("https://qr.de-signplus.com"),

  // Optional: without these, the cache falls back to in-process only and rate
  // limiting is disabled (logged once at startup).
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  // Rotated daily and mixed into the visitor IP hash. Without it, scans are
  // still recorded but `ip_hash` is null, so unique counts are unavailable.
  SCAN_IP_SALT: z.string().min(16).optional(),

  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().default("De Sign Plus <noreply@de-signplus.com>"),

  PAYSTACK_SECRET_KEY: z.string().min(1).optional(),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/** Reset between tests. */
export function resetEnvCache(): void {
  cached = null;
}
