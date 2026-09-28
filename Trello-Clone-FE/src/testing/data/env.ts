import type { Env } from '@/config/env';

// Public values only (VITE_* is never secret). vite.config.ts injects `testEnv` into Vitest.
export const testEnv = {
  VITE_API_URL: 'http://localhost:4000/api/v1',
  VITE_SOCKET_URL: 'http://localhost:4000',
} satisfies Env;

export const invalidEnvs = {
  missingApiUrl: { VITE_SOCKET_URL: testEnv.VITE_SOCKET_URL },
  apiUrlNotAUrl: { ...testEnv, VITE_API_URL: 'not-a-url' },
} satisfies Record<string, Record<string, unknown>>;
