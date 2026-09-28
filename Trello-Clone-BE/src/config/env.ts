import { z } from 'zod';

// Proposed defaults: ACCESS_TOKEN_TTL (D-01), REFRESH_TOKEN_TTL_DAYS (D-02).
const EnvSchema = z.object({
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
