import { ErrorResponseSchema, UserDtoSchema } from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { resetAuthRateLimit } from '../../src/middlewares/rate-limit';
import {
  invalidProfileBodies,
  loginCredentials,
  profileUpdates,
  seededUserName,
  strippedEmail,
} from '../data/auth';
import { paths } from '../data/http';
import { loginAs, seedLoginUser } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';
import { buildRejectedTokens } from '../helpers/tokens';

import type { Express } from 'express';

let app: Express;
let accessToken: string;
let userId: string;

beforeAll(() => {
  app = createApp();
});
beforeEach(async () => {
  await resetDb();
  await resetAuthRateLimit();
  await seedLoginUser();
  ({ accessToken, userId } = await loginAs(app));
});
afterAll(async () => {
  await prisma.$disconnect();
  await testPrisma.$disconnect();
});

const patchMe = (body: object, token = accessToken) =>
  request(app).patch(paths.usersMe).set('Authorization', `Bearer ${token}`).send(body);

describe('PATCH /api/v1/users/me', () => {
  it('200: updates the name (trimmed) and returns the user; the change persists', async () => {
    const res = await patchMe(profileUpdates.name.input);

    expect(res.status).toBe(200);
    expect(UserDtoSchema.parse(res.body.data)).toEqual(res.body.data);
    expect(res.body.data).toMatchObject({ id: userId, name: profileUpdates.name.stored });
    const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.name).toBe(profileUpdates.name.stored);
    expect(stored.avatarUrl).toBeNull(); // untouched
  });

  it('sets and then removes the avatar URL', async () => {
    const set = await patchMe({ avatarUrl: profileUpdates.avatarUrl });
    expect(set.body.data.avatarUrl).toBe(profileUpdates.avatarUrl);

    const removed = await patchMe({ avatarUrl: null });

    expect(removed.status).toBe(200);
    expect(removed.body.data.avatarUrl).toBeNull();
    const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored).toMatchObject({ avatarUrl: null, name: seededUserName });
  });

  it('ignores an email next to a valid field (email changes are out of scope)', async () => {
    const res = await patchMe({ ...profileUpdates.name.input, email: strippedEmail });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(loginCredentials.email);
  });

  it.each(invalidProfileBodies)('400 for $case', async ({ body }) => {
    const res = await patchMe(body);

    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored).toMatchObject({ name: seededUserName, avatarUrl: null });
  });

  it('401 without a token, and with a rejected token', async () => {
    const withoutToken = await request(app).patch(paths.usersMe).send(profileUpdates.name.input);
    expect(withoutToken.status).toBe(401);

    const { expired } = await buildRejectedTokens(userId);
    const withExpired = await patchMe(profileUpdates.name.input, expired);
    expect(withExpired.status).toBe(401);
    expect(withExpired.body.error.code).toBe('UNAUTHORIZED');

    const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.name).toBe(seededUserName);
  });

  it('401 when the user no longer exists', async () => {
    await testPrisma.user.delete({ where: { id: userId } });

    const res = await patchMe(profileUpdates.name.input);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
