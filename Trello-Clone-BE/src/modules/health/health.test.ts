import { afterAll, describe, expect, it } from 'vitest';

import { getStatus } from './health.service';
import { unreachableDatabaseUrl } from '../../../tests/data/env';
import { testPrisma } from '../../../tests/helpers/db';
import { createPrismaClient } from '../../config/prisma';

describe('health.service', () => {
  const unreachable = createPrismaClient(unreachableDatabaseUrl);

  afterAll(async () => {
    await unreachable.$disconnect();
    await testPrisma.$disconnect();
  });

  it('reports db ok when the database answers', async () => {
    await expect(getStatus(testPrisma)).resolves.toEqual({ status: 'ok', db: 'ok' });
  });

  it('reports db down when the database cannot be reached', async () => {
    await expect(getStatus(unreachable)).resolves.toEqual({ status: 'ok', db: 'down' });
  });
});
