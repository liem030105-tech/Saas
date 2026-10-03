import { z } from 'zod';

// Proposed defaults: ACCESS_TOKEN_TTL (D-01), REFRESH_TOKEN_TTL_DAYS (D-02).
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    // Normalised to a bare origin: CORS compares it with the browser's Origin header exactly.
    // http(s) only: another scheme would yield the origin "null", which sandboxed iframes send.
    CLIENT_URL: z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin),
    DATABASE_URL: z.url(),
    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
    ACCESS_TOKEN_TTL: z
      .string()
      .regex(/^\d+[smhd]$/, 'must look like 15m, 1h, …')
      .default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    // Attachments (ATTACHMENTS-001, ADR-020). Optional: without a bucket, uploads fail (logged).
    S3_BUCKET: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).optional(),
    /** An S3-compatible endpoint (MinIO for local development); path-style addressing then. */
    S3_ENDPOINT: z.url().optional(),
    /** How long a signed file URL works, in seconds (D-27, proposed default 1 hour). */
    S3_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(604_800).default(3600),
    // Billing (BILLING-001, Stripe test mode). Optional: without them, checkout and the portal answer
    // 500 (logged) and webhooks are refused.
    STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
    /** The Pro price: per member per month (D-13), so checkout's quantity is the member count. */
    STRIPE_PRICE_PRO: z.string().startsWith('price_').optional(),
    /**
     * How many proxies sit in front of the API (DEPLOYMENT-001): Express then takes the client's IP
     * from X-Forwarded-For, which the rate limiter keys on. 0 = none (local); 1 on Render.
     */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    // Error tracking (DEPLOYMENT-001, ADR-024). Optional: without a DSN, nothing is sent.
    SENTRY_DSN: z.url().optional(),
    /** Separates staging from production in Sentry: both run with NODE_ENV=production. */
    SENTRY_ENVIRONMENT: z.string().min(1).optional(),
    /** Set by Render to the deployed commit; Sentry groups errors by it (the release). */
    RENDER_GIT_COMMIT: z.string().min(1).optional(),
  })
  // Production serves the FE over HTTPS only (Secure cookie, ADR-023); an http origin is a mistake.
  .refine((env) => env.NODE_ENV !== 'production' || env.CLIENT_URL.startsWith('https://'), {
    path: ['CLIENT_URL'],
    message: 'must be an https:// origin in production',
  });

export type Env = z.infer<typeof EnvSchema>;

export type EnvResult = { success: true; env: Env } | { success: false; message: string };

export function parseEnv(source: Record<string, string | undefined>): EnvResult {
  // `.env.example` ships empty values; an empty variable counts as unset so defaults apply.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = EnvSchema.safeParse(cleaned);
  if (result.success) return { success: true, env: result.data };
  return {
    success: false,
    message: `Invalid environment (see Trello-Clone-BE/.env.example):\n${z.prettifyError(result.error)}`,
  };
}

function loadEnv(): Env {
  const result = parseEnv(process.env);
  if (!result.success) {
    process.stderr.write(`${result.message}\n`);
    process.exit(1);
  }
  return result.env;
}

export const env = loadEnv();
