// Runs before typecheck, test, and build: the Prisma client is generated code (git-ignored),
// so a fresh checkout must run `db:generate` first. Fail with that instruction, not a type error.
/* global process, URL -- plain Node script, outside the TypeScript projects */
import { existsSync } from 'node:fs';

const client = new URL('../src/generated/prisma/client.ts', import.meta.url);

if (!existsSync(client)) {
  process.stderr.write(
    'Prisma client not generated. Run: pnpm --filter @trello-clone/api db:generate\n',
  );
  process.exit(1);
}
