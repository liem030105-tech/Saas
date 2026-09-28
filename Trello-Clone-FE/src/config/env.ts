import { z } from 'zod';

// Only VITE_* variables reach the bundle, and all of them are public (security.md).
const EnvSchema = z.object({
  VITE_API_URL: z.url(),
  VITE_SOCKET_URL: z.url(),
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
