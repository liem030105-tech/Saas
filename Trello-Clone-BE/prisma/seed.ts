// `pnpm --filter @trello-clone/api db:seed`. Idempotent: running it again changes nothing.
import { z } from 'zod';

import { demoUser } from './seed-data';
import { prisma } from '../src/config/prisma';
import { hashPassword } from '../src/lib/password';

const SeedEnv = z.object({
  SEED_DEMO_PASSWORD: z.string().min(8, 'must be at least 8 characters'),
});

async function main() {
  const parsed = SeedEnv.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Cannot seed:\n${z.prettifyError(parsed.error)}`);
  }

  // Create only when missing, so a second run leaves the row (and its updatedAt) untouched.
  const existing = await prisma.user.findUnique({
    where: { email: demoUser.email },
    select: { id: true },
  });
  if (existing) {
    process.stdout.write(`Seed: ${demoUser.email} already exists, nothing to do.\n`);
    return;
  }

  await prisma.user.create({
    data: {
      ...demoUser,
      passwordHash: await hashPassword(parsed.data.SEED_DEMO_PASSWORD),
    },
  });
  process.stdout.write(`Seed: created ${demoUser.email}.\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
