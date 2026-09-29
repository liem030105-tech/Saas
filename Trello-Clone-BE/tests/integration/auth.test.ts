import {
  AuthResponseSchema,
  ErrorResponseSchema,
  RefreshResponseSchema,
  UserDtoSchema,
} from '@trello-clone/shared';
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
  invalidCredentialsMessage,
  invalidLoginBodies,
  invalidRegisterBodies,
  loginCredentials,
  malformedAuthHeaders,
  mixedCaseEmail,
  jsonRefreshCookies,
  unknownRefreshToken,
} from '../data/auth';
import { testEnv } from '../data/env';
import { paths } from '../data/http';
import { loginAs, seedLoginUser } from '../helpers/auth';
import { resetDb, testPrisma } from '../helpers/db';
import { buildRejectedTokens } from '../helpers/tokens';

import type { Express } from 'express';

const REGISTER = paths.register;
const LOGIN = paths.login;
const REFRESH = paths.refresh;
const ME = paths.me;
const LOGOUT = paths.logout;

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

describe('POST /api/v1/auth/register', () => {
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
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain(input.password);

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

  it('409 for the loser when the same email registers twice at once (unique index)', async () => {
    const input = buildRegisterInput();

    const responses = await Promise.all([
      request(app).post(REGISTER).send(input),
      request(app).post(REGISTER).send(input),
    ]);

    expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);
    const loser = responses.find((res) => res.status === 409)!;
    expect(ErrorResponseSchema.parse(loser.body).error.code).toBe('CONFLICT');
    expect(refreshCookie(loser)).toBeUndefined();
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

describe('POST /api/v1/auth/login', () => {
  const { email, password, typedEmail, wrongPassword, unknownEmail } = loginCredentials;

  beforeEach(seedLoginUser);

  it('200: returns the user and a valid access token, and starts a new token family', async () => {
    const res = await request(app).post(LOGIN).send({ email: typedEmail, password });

    expect(res.status).toBe(200);
    const { data } = res.body as { data: unknown };
    expect(AuthResponseSchema.parse(data)).toEqual(data);
    expect(res.body.data.user.email).toBe(email);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const key = new TextEncoder().encode(testEnv.JWT_ACCESS_SECRET);
    const { payload } = await jwtVerify(res.body.data.accessToken, key);
    expect(payload.sub).toBe(res.body.data.user.id);

    const cookie = refreshCookie(res);
    expect(cookie?.attributes).toEqual(
      expect.arrayContaining([
        'httponly',
        'secure',
        'samesite=strict',
        `path=${expectedRefreshCookie.path}`,
        `max-age=${expectedRefreshCookie.maxAgeSeconds}`,
      ]),
    );
    const tokens = await testPrisma.refreshToken.findMany();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.tokenHash).toBe(hashRefreshToken(cookie!.value));
  });

  it('each login is its own family (other sessions stay valid)', async () => {
    await request(app).post(LOGIN).send({ email, password }).expect(200);
    await request(app).post(LOGIN).send({ email, password }).expect(200);

    const tokens = await testPrisma.refreshToken.findMany();
    expect(tokens).toHaveLength(2);
    expect(new Set(tokens.map((token) => token.familyId)).size).toBe(2);
    expect(tokens.every((token) => token.revokedAt === null)).toBe(true);
  });

  it('401 INVALID_CREDENTIALS: identical bodies for a wrong password and an unknown email', async () => {
    const wrong = await request(app).post(LOGIN).send({ email, password: wrongPassword });
    const unknown = await request(app).post(LOGIN).send({ email: unknownEmail, password });

    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(ErrorResponseSchema.parse(res.body).error).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: invalidCredentialsMessage,
        details: [],
      });
      expect(refreshCookie(res)).toBeUndefined();
    }
    const withoutRequestId = (res: request.Response) => ({ ...res.body.error, requestId: null });
    expect(withoutRequestId(wrong)).toEqual(withoutRequestId(unknown));
    expect(await testPrisma.refreshToken.count()).toBe(0);
  });

  it.each(invalidLoginBodies)('400 for $case', async ({ field, body }) => {
    const res = await request(app).post(LOGIN).send(body);

    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: field })]),
    );
    expect(refreshCookie(res)).toBeUndefined();
  });

  it('429 RATE_LIMITED with Retry-After once the per-IP limit is used up', async () => {
    for (let i = 0; i < RATE_LIMITS.auth.limit; i += 1) {
      await request(app).post(LOGIN).send({ email, password: wrongPassword }).expect(401);
    }

    const res = await request(app).post(LOGIN).send({ email, password });

    expect(res.status).toBe(429);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toEqual(expect.any(String));
  });
});

describe('POST /api/v1/auth/refresh', () => {
  const key = new TextEncoder().encode(testEnv.JWT_ACCESS_SECRET);

  /** Signs in and returns the raw refresh token from the cookie. */
  async function signIn() {
    const { res, userId } = await loginAs(app);
    return { raw: refreshCookie(res)!.value, userId };
  }

  const refreshWith = (raw: string) =>
    request(app).post(REFRESH).set('Cookie', `${expectedRefreshCookie.name}=${raw}`);

  /** The response cleared the cookie (empty value, expired, same path). */
  function expectCookieCleared(res: request.Response) {
    const cookie = refreshCookie(res);
    expect(cookie?.value).toBe('');
    expect(cookie?.attributes).toEqual(
      expect.arrayContaining([
        `path=${expectedRefreshCookie.path}`,
        expect.stringMatching(/^expires=thu, 01 jan 1970/),
      ]),
    );
  }

  beforeEach(seedLoginUser);

  it('200: rotates the token in the same family, keeping its expiry, and returns an access token', async () => {
    const { raw, userId } = await signIn();
    const before = await testPrisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(raw) },
    });

    const res = await refreshWith(raw);

    expect(res.status).toBe(200);
    expect(RefreshResponseSchema.parse(res.body.data)).toEqual(res.body.data);
    const { payload } = await jwtVerify(res.body.data.accessToken, key);
    expect(payload.sub).toBe(userId);

    const cookie = refreshCookie(res)!;
    expect(cookie.value).not.toBe(raw);
    expect(cookie.attributes).toEqual(
      expect.arrayContaining([
        'httponly',
        'secure',
        'samesite=strict',
        `path=${expectedRefreshCookie.path}`,
      ]),
    );
    const maxAge = Number(cookie.attributes.find((a) => a.startsWith('max-age='))!.split('=')[1]);
    expect(maxAge).toBeLessThanOrEqual(expectedRefreshCookie.maxAgeSeconds);

    const old = await testPrisma.refreshToken.findUniqueOrThrow({ where: { id: before.id } });
    const next = await testPrisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(cookie.value) },
    });
    expect(old.revokedAt).not.toBeNull();
    expect(old.replacedById).toBe(next.id);
    expect(next).toMatchObject({
      familyId: before.familyId,
      expiresAt: before.expiresAt,
      revokedAt: null,
    });
  });

  it('the successor can refresh again', async () => {
    const { raw } = await signIn();
    const first = await refreshWith(raw).expect(200);

    await refreshWith(refreshCookie(first)!.value).expect(200);
  });

  it('401 TOKEN_REUSED for a replayed token: the whole family is revoked and the cookie cleared', async () => {
    const { raw } = await signIn();
    const other = await signIn(); // another device: a different family
    const successor = refreshCookie(await refreshWith(raw).expect(200))!.value;

    const replay = await refreshWith(raw);

    expect(replay.status).toBe(401);
    expect(ErrorResponseSchema.parse(replay.body).error.code).toBe('TOKEN_REUSED');
    expectCookieCleared(replay);

    const afterReplay = await refreshWith(successor);
    expect(afterReplay.status).toBe(401);
    expect(afterReplay.body.error.code).toBe('TOKEN_REUSED');

    const family = await testPrisma.refreshToken.findMany({
      where: {
        familyId: (
          await testPrisma.refreshToken.findUniqueOrThrow({
            where: { tokenHash: hashRefreshToken(raw) },
          })
        ).familyId,
      },
    });
    expect(family.every((token) => token.revokedAt !== null)).toBe(true);
    await refreshWith(other.raw).expect(200); // other sessions are untouched
  });

  it('two concurrent refreshes with the same token leave at most one live successor', async () => {
    const { raw } = await signIn();

    const responses = await Promise.all([refreshWith(raw), refreshWith(raw)]);

    expect(responses.some((res) => res.status === 401)).toBe(true);
    for (const res of responses.filter((r) => r.status === 401)) {
      expect(res.body.error.code).toBe('TOKEN_REUSED');
    }
    expect(await testPrisma.refreshToken.count({ where: { revokedAt: null } })).toBeLessThanOrEqual(
      1,
    );
  });

  it('401 UNAUTHORIZED for an expired token, and the cookie is cleared', async () => {
    const { raw } = await signIn();
    await testPrisma.refreshToken.update({
      where: { tokenHash: hashRefreshToken(raw) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await refreshWith(raw);

    expect(res.status).toBe(401);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('UNAUTHORIZED');
    expectCookieCleared(res);
  });

  it('401 UNAUTHORIZED for an unknown token', async () => {
    const res = await refreshWith(unknownRefreshToken);

    expect(res.status).toBe(401);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('UNAUTHORIZED');
    expectCookieCleared(res);
  });

  it('401 UNAUTHORIZED without the cookie', async () => {
    const res = await request(app).post(REFRESH);

    expect(res.status).toBe(401);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('UNAUTHORIZED');
    expectCookieCleared(res);
  });

  it.each(jsonRefreshCookies)(
    '401 UNAUTHORIZED (not 500) for the non-string cookie %s',
    async (value) => {
      const res = await refreshWith(value);

      expect(res.status).toBe(401);
      expect(ErrorResponseSchema.parse(res.body).error.code).toBe('UNAUTHORIZED');
      expectCookieCleared(res);
    },
  );
});

describe('GET /api/v1/auth/me (and the authenticate middleware)', () => {
  const { email } = loginCredentials;

  function expectUnauthorized(res: request.Response) {
    expect(res.status).toBe(401);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('UNAUTHORIZED');
  }

  beforeEach(seedLoginUser);

  it('200: returns the signed-in user', async () => {
    const { accessToken, userId } = await loginAs(app);

    const res = await request(app).get(ME).set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(UserDtoSchema.parse(res.body.data)).toEqual(res.body.data);
    expect(res.body.data).toMatchObject({ id: userId, email });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('401 without an Authorization header', async () => {
    expectUnauthorized(await request(app).get(ME));
  });

  it.each(malformedAuthHeaders)('401 for the header %j', async (header) => {
    expectUnauthorized(await request(app).get(ME).set('Authorization', header));
  });

  it('401 for expired, wrongly signed, unsigned (alg none), tampered, and sub-less tokens', async () => {
    const { userId } = await loginAs(app);
    const tokens = await buildRejectedTokens(userId);

    for (const [kind, token] of Object.entries(tokens)) {
      const res = await request(app).get(ME).set('Authorization', `Bearer ${token}`);
      expect(res.status, kind).toBe(401);
      expect(res.body.error.code, kind).toBe('UNAUTHORIZED');
    }
  });

  it('401 when the user no longer exists', async () => {
    const { accessToken, userId } = await loginAs(app);
    await testPrisma.user.delete({ where: { id: userId } });

    expectUnauthorized(await request(app).get(ME).set('Authorization', `Bearer ${accessToken}`));
  });
});

describe('POST /api/v1/auth/logout', () => {
  beforeEach(seedLoginUser);

  const withCookie = (raw: string) =>
    request(app).post(LOGOUT).set('Cookie', `${expectedRefreshCookie.name}=${raw}`);

  function expectLoggedOut(res: request.Response) {
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    const cookie = refreshCookie(res);
    expect(cookie?.value).toBe('');
    expect(cookie?.attributes).toEqual(
      expect.arrayContaining([
        `path=${expectedRefreshCookie.path}`,
        expect.stringMatching(/^expires=thu, 01 jan 1970/),
      ]),
    );
  }

  it('204: revokes the whole family, clears the cookie, and the old cookie cannot refresh', async () => {
    const { res: login } = await loginAs(app);
    const first = refreshCookie(login)!.value;
    // Rotate once, so the family has a revoked and a live token.
    const current = refreshCookie(
      await request(app)
        .post(REFRESH)
        .set('Cookie', `${expectedRefreshCookie.name}=${first}`)
        .expect(200),
    )!.value;

    expectLoggedOut(await withCookie(current));

    const tokens = await testPrisma.refreshToken.findMany();
    expect(tokens).toHaveLength(2);
    expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);
    const afterLogout = await request(app)
      .post(REFRESH)
      .set('Cookie', `${expectedRefreshCookie.name}=${current}`);
    expect(afterLogout.status).toBe(401);
  });

  it('works without an access token and leaves other devices signed in', async () => {
    const thisDevice = refreshCookie((await loginAs(app)).res)!.value;
    const otherDevice = refreshCookie((await loginAs(app)).res)!.value;

    expectLoggedOut(await withCookie(thisDevice)); // no Authorization header

    await request(app)
      .post(REFRESH)
      .set('Cookie', `${expectedRefreshCookie.name}=${otherDevice}`)
      .expect(200);
  });

  it('204 and a cleared cookie without a cookie (idempotent)', async () => {
    expectLoggedOut(await request(app).post(LOGOUT));
  });

  it.each([unknownRefreshToken, ...jsonRefreshCookies])(
    '204 for an unknown or non-string cookie %s, revoking nothing',
    async (value) => {
      await loginAs(app);

      expectLoggedOut(await withCookie(value));

      expect(await testPrisma.refreshToken.count({ where: { revokedAt: null } })).toBe(1);
    },
  );

  it('a refresh racing the logout leaves no live token in the family', async () => {
    const raw = refreshCookie((await loginAs(app)).res)!.value;

    await Promise.all([
      request(app).post(REFRESH).set('Cookie', `${expectedRefreshCookie.name}=${raw}`),
      withCookie(raw),
    ]);

    expect(await testPrisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('204 when logging out twice', async () => {
    const raw = refreshCookie((await loginAs(app)).res)!.value;

    expectLoggedOut(await withCookie(raw));
    expectLoggedOut(await withCookie(raw));
  });
});
