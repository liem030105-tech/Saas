import { execFileSync } from 'node:child_process';

import { testDatabaseUrl } from './data/env';
import { assertTestDatabaseUrl } from './helpers/test-database';

/** Vitest globalSetup: applies the migrations to the test database once per run. */
export function setup() {
  const url = assertTestDatabaseUrl(testDatabaseUrl);
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, DATABASE_URL: url },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}
