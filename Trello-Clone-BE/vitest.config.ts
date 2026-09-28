import { defineConfig } from 'vitest/config';

import { testEnv } from './tests/data/env.ts';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Test-only values validated by src/config/env.ts; they live with the other test data.
    env: testEnv,
  },
});
