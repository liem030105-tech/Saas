// Test-only configuration. None of these are real credentials: the database is the local
// throwaway `postgres-test` (docker-compose.yml) and the JWT secret signs nothing outside tests.

/** CI (or a developer) may point tests at another test database; its name must end in `_test`. */
export const testDatabaseUrl =
  process.env.DATABASE_URL_TEST ?? 'postgresql://trello:trello@localhost:5433/trello_test';

export const testEnv = {
  NODE_ENV: 'test',
  PORT: '4001',
  CLIENT_URL: 'http://localhost:5173',
  // The app under test talks to the test database too, so /health checks it.
  DATABASE_URL: testDatabaseUrl,
  DATABASE_URL_TEST: testDatabaseUrl,
  JWT_ACCESS_SECRET: 'test-only-access-secret-0123456789abcdef',
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL_DAYS: '30',
} satisfies Record<string, string>;

/** Variants env.ts must reject, keyed by what is wrong. */
export const invalidEnvs = {
  missingJwtSecret: { ...testEnv, JWT_ACCESS_SECRET: undefined },
  shortJwtSecret: { ...testEnv, JWT_ACCESS_SECRET: 'too-short' },
  clientUrlNotAUrl: { ...testEnv, CLIENT_URL: 'localhost' },
  clientUrlNotHttp: { ...testEnv, CLIENT_URL: 'file:///srv/app' },
  badTtl: { ...testEnv, ACCESS_TOKEN_TTL: 'fifteen minutes' },
} satisfies Record<string, Record<string, string | undefined>>;

/** Only the required variables; everything else takes its documented default. */
export const minimalEnv = {
  CLIENT_URL: testEnv.CLIENT_URL,
  DATABASE_URL: testEnv.DATABASE_URL,
  JWT_ACCESS_SECRET: testEnv.JWT_ACCESS_SECRET,
  PORT: '', // empty, as copied from .env.example
};

/** A CLIENT_URL with a trailing path; env.ts must reduce it to the bare origin. */
export const clientUrlWithPath = {
  input: `${testEnv.CLIENT_URL}/app/`,
  origin: testEnv.CLIENT_URL,
};

/** Nothing listens on port 1: a client built from this URL can never connect. */
export const unreachableDatabaseUrl = 'postgresql://trello:trello@localhost:1/unreachable_test';

/** Database URLs the test helper must refuse (not a `_test` database). */
export const nonTestDatabaseUrls = [
  'postgresql://trello:trello@localhost:5432/trello',
  'postgresql://trello:trello@localhost:5433/trello_test_backup',
];

export const envDefaults = {
  NODE_ENV: 'development',
  PORT: 4000,
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL_DAYS: 30,
} as const;
