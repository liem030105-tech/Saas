import { existsSync } from 'node:fs';

import { defineConfig } from 'prisma/config';

// Prisma 7 does not load environment files itself. Load the package's local one when present
// (no dotenv: Node's built-in loader, like the dev/start scripts); CI sets real variables.
const LOCAL_ENV_FILE = new URL('./.env', import.meta.url);
if (existsSync(LOCAL_ENV_FILE)) process.loadEnvFile(LOCAL_ENV_FILE);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  // Optional so `prisma generate` works without a database (CI typecheck/build);
  // migrate, seed, and studio fail with Prisma's own message when it is missing.
  datasource: { url: process.env.DATABASE_URL },
});
