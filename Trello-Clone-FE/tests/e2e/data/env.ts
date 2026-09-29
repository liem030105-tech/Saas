// E2E configuration. Test-only values: the database is the throwaway test database and the JWT
// secret signs nothing outside E2E runs. Ports differ from `pnpm dev` (4000/5173), so both can run.

/**
 * Default test database (docker-compose `postgres-test`); DATABASE_URL_TEST overrides it in
 * playwright.config.ts. Its name must end in `_test`.
 */
export const defaultE2eDatabaseUrl = 'postgresql://trello:trello@localhost:5433/trello_test';

export const e2ePorts = { api: 4100, web: 5174 } as const;

export const e2eUrls = {
  web: `http://localhost:${e2ePorts.web}`,
  api: `http://localhost:${e2ePorts.api}/api/v1`,
  socket: `http://localhost:${e2ePorts.api}`,
  health: `http://localhost:${e2ePorts.api}/api/v1/health`,
} as const;

/** Environment of the API started for E2E (validated by Trello-Clone-BE/src/config/env.ts). */
export const buildE2eApiEnv = (databaseUrl: string) => ({
  NODE_ENV: 'test',
  PORT: String(e2ePorts.api),
  CLIENT_URL: e2eUrls.web,
  DATABASE_URL: databaseUrl,
  JWT_ACCESS_SECRET: 'e2e-only-access-secret-0123456789abcdef',
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL_DAYS: '30',
});

/** Public values for the web app (VITE_* is bundled). */
export const e2eWebEnv = {
  VITE_API_URL: e2eUrls.api,
  VITE_SOCKET_URL: e2eUrls.socket,
};
