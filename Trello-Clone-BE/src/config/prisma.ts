import { PrismaPg } from '@prisma/adapter-pg';

import { env } from './env';
import { logger } from './logger';
import { PrismaClient } from '../generated/prisma/client';

export function createPrismaClient(connectionString: string) {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });
  // Prisma's own logs go through Pino so they carry the same format and redaction.
  client.$on('warn', (event) => logger.warn({ prisma: event }, 'Prisma warning'));
  client.$on('error', (event) => logger.error({ prisma: event }, 'Prisma error'));
  return client;
}

/** The app's single PrismaClient. Tests build their own from DATABASE_URL_TEST. */
export const prisma = createPrismaClient(env.DATABASE_URL);
