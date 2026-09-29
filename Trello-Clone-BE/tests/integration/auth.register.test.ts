import { AuthResponseSchema, ErrorResponseSchema } from '@trello-clone/shared';
import { jwtVerify } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { RATE_LIMITS, resetAuthRateLimit } from '../../src/middlewares/rate-limit';
import { hashRefreshToken } from '../../src/modules/auth/tokens';
import {
  buildRegisterInput,
  expectedRefreshCookie,
  invalidRegisterBodies,
  mixedCaseEmail,
} from '../data/auth';
import { testEnv } from '../data/env';
import { resetDb, testPrisma } from '../helpers/db';

import type { Express } from 'express';

const REGISTER = '/api/v1/auth/register';

/** Splits the Set-Cookie header of the refresh cookie into its value and lower-cased attributes. */
function refreshCookie(res: request.Response) {
  const header = ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((cookie) => cookie.startsWith(`${expectedRefreshCookie.name}=`));
  if (!header) return undefined;
  const [pair, ...attributes] = header.split(';').map((part) => part.trim());
  return {
    value: decodeURIComponent(pair!.slice(expectedRefreshCookie.name.length + 1)),
    attributes: attributes.map((attribute) => attribute.toLowerCase()),
  };
}

describe('POST /api/v1/auth/register', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });
  beforeEach(async () => {
    await resetDb();
    await resetAuthRateLimit();
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await testPrisma.$disconnect();
  });

  it('201: creates the user and returns the user and a valid access token', async () => {
    const input = buildRegisterInput();

    const res = await request(app).post(REGISTER).send(input);

    expect(res.status).toBe(201);
    const { data } = res.body as { data: unknown };
    expect(AuthResponseSchema.parse(data)).toEqual(data);
    expect(res.body.data.user).toMatchObject({
      email: input.email,
      name: input.name,
      avatarUrl: null,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|correct horse/);

    const key = new TextEncoder().encode(testEnv.JWT_ACCESS_SECRET);
    const { payload } = await jwtVerify(res.body.data.accessToken, key);
    expect(payload.sub).toBe(res.body.data.user.id);
  });

  it('sets the refresh cookie with the exact attributes', async () => {
    const res = await request(app).post(REGISTER).send(buildRegisterInput());

    const cookie = refreshCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie!.attributes).toEqual(
      expect.arrayContaining([
        'httponly',
        'secure', // NODE_ENV=test; only development drops it
        'samesite=strict',
        `path=${expectedRefreshCookie.path}`,
        `max-age=${expectedRefreshCookie.maxAgeSeconds}`,
      ]),
    );
  });

  it('stores only the hash of the refresh token, and a bcrypt password hash', async () => {
    const input = buildRegisterInput();

    const res = await request(app).post(REGISTER).send(input);

    const raw = refreshCookie(res)!.value;
    const tokens = await testPrisma.refreshToken.findMany();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.tokenHash).toBe(hashRefreshToken(raw));
    expect(JSON.stringify(tokens)).not.toContain(raw);

    const user = await testPrisma.user.findUniqueOrThrow({ where: { email: input.email } });
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/); // bcrypt, cost 12 (D-03)
    expect(user.passwordHash).not.toContain(input.password);
  });

  it('stores the email trimmed and lower-cased', async () => {
    const res = await request(app)
      .post(REGISTER)
      .send(buildRegisterInput({ email: mixedCaseEmail.input }));

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(mixedCaseEmail.normalized);
    expect(await testPrisma.user.count({ where: { email: mixedCaseEmail.normalized } })).toBe(1);
  });

  it.each(invalidRegisterBodies)('400 for $case', async ({ field, body }) => {
    const res = await request(app).post(REGISTER).send(body);

    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: field })]),
    );
    expect(await testPrisma.user.count()).toBe(0);
    expect(refreshCookie(res)).toBeUndefined();
  });

  it('409 for an email that is already registered, in any case', async () => {
    await request(app)
      .post(REGISTER)
      .send(buildRegisterInput({ email: mixedCaseEmail.normalized }))
      .expect(201);

    const res = await request(app)
      .post(REGISTER)
      .send(buildRegisterInput({ email: mixedCaseEmail.input.toUpperCase() }));

    expect(res.status).toBe(409);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('CONFLICT');
    expect(refreshCookie(res)).toBeUndefined();
    expect(await testPrisma.user.count()).toBe(1);
    expect(await testPrisma.refreshToken.count()).toBe(1);
  });

  it('429 RATE_LIMITED with Retry-After once the per-IP limit is used up', async () => {
    for (let i = 0; i < RATE_LIMITS.auth.limit; i += 1) {
      await request(app).post(REGISTER).send(buildRegisterInput()).expect(201);
    }

    const res = await request(app).post(REGISTER).send(buildRegisterInput());

    expect(res.status).toBe(429);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toEqual(expect.any(String));
  });
});
