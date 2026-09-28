import { logger } from '../../config/logger';
import { prisma } from '../../config/prisma';

import type { PrismaClient } from '../../generated/prisma/client';

export interface HealthStatus {
  /** The process is up and answering. */
  status: 'ok';
  /** Result of `SELECT 1` against the database. */
  db: 'ok' | 'down';
}

type Database = Pick<PrismaClient, '$queryRaw'>;

export async function getStatus(db: Database = prisma): Promise<HealthStatus> {
  try {
    await db.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'ok' };
  } catch (error) {
    logger.warn({ err: error }, 'Health check: database unreachable');
    return { status: 'ok', db: 'down' };
  }
}
