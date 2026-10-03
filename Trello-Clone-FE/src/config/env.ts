import { z } from 'zod';

// Only VITE_* variables reach the bundle, and all of them are public (security.md).
// `.env.example` ships empty optional values; an empty one counts as unset.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const EnvSchema = z.object({
  VITE_API_URL: z.url(),
  VITE_SOCKET_URL: z.url(),
  // Error tracking (ADR-024): off without a DSN. A DSN only lets a client send events (public).
  VITE_SENTRY_DSN: optional(z.url()),
  VITE_SENTRY_ENVIRONMENT: optional(z.string()),
  /** Set by Vercel to the deployed commit; Sentry groups errors by it (the release). */
  VITE_VERCEL_GIT_COMMIT_SHA: optional(z.string()),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid frontend environment (see Trello-Clone-FE/.env.example):\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

export const env = parseEnv(import.meta.env);
