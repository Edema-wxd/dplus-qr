import { z } from "zod";

/**
 * Environment contract. Parsed lazily so that `next build` works without
 * secrets present -- only code paths that actually need a value will throw,
 * and they throw with the variable name in the message.
 *
 * Variables marked "Neon-managed" are written by `neon deploy` / `neon env
 * pull`. Do not hand-edit them; re-pull instead.
 */
const schema = z.object({
  // Neon-managed. Pooled (PgBouncer) connection for application queries.
  //
  // Optional in the schema, required at the point of use via `required()`.
  // env() validates the whole contract at once, so marking anything mandatory
  // here makes an unrelated module fail on a variable it never asked for --
  // which is exactly how the first Vercel build broke, on a route that only
  // needed the auth URL.
  DATABASE_URL: z.string().min(1).optional(),

  // Neon-managed. Direct connection, required for migrations, dumps and
  // anything relying on session state. Pooled connections break those in ways
  // that never mention pooling.
  DATABASE_URL_UNPOOLED: z.string().min(1).optional(),

  NEON_BRANCH: z.string().optional(),

  // Public base of the redirect host. This string is baked into printed codes,
  // so it can never change once a code has been printed.
  QR_BASE_URL: z.string().url().default("https://qriateplus.com"),

  // --- Neon Auth (Managed Better Auth) ---
  // Neon-managed base URL; the cookie secret is ours to generate and keep.
  NEON_AUTH_BASE_URL: z.string().url().optional(),
  NEON_AUTH_COOKIE_SECRET: z.string().min(32).optional(),

  // --- Neon Object Storage (S3-compatible) ---
  // AWS-standard names, so the AWS SDK picks them up from the environment.
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  AWS_ENDPOINT_URL_S3: z.string().url().optional(),
  AWS_REGION: z.string().min(1).optional(),
  // Bucket declared in neon.ts.
  QR_BUCKET: z.string().min(1).default("assets"),

  // Optional: without these, the cache falls back to in-process only and rate
  // limiting is disabled (logged once at startup).
  UPSTASH_REDIS_REST_URL: z.union([z.string().url(), z.literal("")]).optional(),
  UPSTASH_REDIS_REST_TOKEN: z.union([z.string().min(1), z.literal("")]).optional(),

  // Rotated daily and mixed into the visitor IP hash. Without it, scans are
  // still recorded but `ip_hash` is null, so unique counts are unavailable.
  SCAN_IP_SALT: z.string().min(16).optional(),

  // Every outbound message leaves through Resend. This key is the API path --
  // admin alerts, abuse reports and anything else this app sends itself.
  //
  // Neon Auth's verification, password-reset and OTP email goes through the
  // same Resend account over SMTP, but that credential is held by the managed
  // service, not by us: `neon neon-auth config email-provider get`. It is not
  // an env var here, and login still needs no mailer in this process.
  //
  // There is deliberately no EMAIL_FROM. Sender addresses are grouped by what
  // the message is about -- onboarding, plans, support -- in `MAIL_GROUPS` in
  // `src/lib/email.ts`, and every send names a group. A single env override
  // would let one deployment send billing mail from the onboarding address,
  // which is the drift the grouping exists to prevent.
  //
  // Sending requires the group's domain to be verified at resend.com/domains.
  // Until it is, Resend rejects the send with a 403 and `sendEmail` logs it
  // rather than failing the caller.
  RESEND_API_KEY: z.string().min(1).optional(),

  PAYSTACK_SECRET_KEY: z.string().min(1).optional(),

  // One shared secret for every /api/cron/* route: the scan rollup and
  // retention sweep, and the grace-period lapse that moves subscriptions and
  // emails customers. Vercel Cron sends it as `authorization: Bearer <value>`.
  //
  // Absent, those routes refuse every request rather than running
  // unauthenticated. A scheduled job that accepts strangers is worse than one
  // that does not run: it changes billing state and sends mail, and the
  // failure to run is at least visible.
  CRON_SECRET: z.string().min(16).optional(),

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

/**
 * Throw with a usable message when an optional variable turns out to be
 * required by the path being executed.
 */
export function required<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env()[key];
  if (value === undefined || value === "") {
    throw new Error(
      `${key} is not set. Run \`neon env pull\` for Neon-managed values, or see .env.example.`
    );
  }
  return value as NonNullable<Env[K]>;
}
