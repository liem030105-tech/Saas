import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { nonTestDatabaseUrls, testDatabaseUrl } from '../data/env';
import { buildUser } from '../data/users';
import { resetDb, testPrisma } from '../helpers/db';
import { assertTestDatabaseUrl } from '../helpers/test-database';

describe('test database helpers', () => {
  beforeEach(resetDb);
  afterAll(() => testPrisma.$disconnect());

  it('resetDb empties the tables', async () => {
    await testPrisma.user.createMany({ data: [buildUser(), buildUser()] });
    expect(await testPrisma.user.count()).toBe(2);

    await resetDb();

    expect(await testPrisma.user.count()).toBe(0);
  });

  it('keeps the email unique (User_email_key)', async () => {
    const user = buildUser();
    await testPrisma.user.create({ data: user });

    await expect(testPrisma.user.create({ data: { ...user, name: 'Other' } })).rejects.toThrow();
  });

  it('accepts the test database URL', () => {
    expect(assertTestDatabaseUrl(testDatabaseUrl)).toBe(testDatabaseUrl);
  });

  it.each(nonTestDatabaseUrls)('refuses %s', (url) => {
    expect(() => assertTestDatabaseUrl(url)).toThrow(/must end in _test/);
  });
});
