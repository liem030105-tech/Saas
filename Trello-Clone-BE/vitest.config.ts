import { defineConfig } from 'vitest/config';

import { testEnv } from './tests/data/env.ts';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Test-only values validated by src/config/env.ts; they live with the other test data.
    env: testEnv,
    // Applies migrations to the test database once (refuses non-`_test` databases).
    globalSetup: ['./tests/global-setup.ts'],
    // Files share one database, so they run one after another (testing.md).
    fileParallelism: false,
  },
});
