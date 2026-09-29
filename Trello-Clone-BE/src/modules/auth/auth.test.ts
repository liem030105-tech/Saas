import { jwtVerify } from 'jose';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { REFRESH_COOKIE_PATH } from './cookie';
import {
  createRefreshFamily,
  hashRefreshToken,
  issueAccessToken,
  newRawRefreshToken,
} from './tokens';
import { accessTokenTtlSeconds, expectedRefreshCookie } from '../../../tests/data/auth';
import { testEnv } from '../../../tests/data/env';
import { buildUser } from '../../../tests/data/users';
import { resetDb, testPrisma } from '../../../tests/helpers/db';
import { API_PREFIX } from '../../app';

const accessKey = new TextEncoder().encode(testEnv.JWT_ACCESS_SECRET);

describe('issueAccessToken', () => {
  it('signs an HS256 JWT with sub = userId and the configured lifetime', async () => {
    const token = await issueAccessToken('user-123');

    const { payload, protectedHeader } = await jwtVerify(token, accessKey);
    expect(protectedHeader.alg).toBe('HS256');
    expect(payload.sub).toBe('user-123');
    expect(payload.exp! - payload.iat!).toBe(accessTokenTtlSeconds);
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub']); // no roles embedded
  });

  it('is rejected by a different secret', async () => {
    const token = await issueAccessToken('user-123');
    const otherKey = new TextEncoder().encode(`${testEnv.JWT_ACCESS_SECRET}-other`);

    await expect(jwtVerify(token, otherKey)).rejects.toThrow();
  });
});

describe('refresh token values', () => {
  it('generates 256-bit base64url tokens that never repeat', () => {
    const tokens = new Set(Array.from({ length: 100 }, newRawRefreshToken));

    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[\w-]{43}$/);
  });

  it('hashes with sha256 (hex): deterministic and never the raw value', () => {
    const raw = newRawRefreshToken();

    expect(hashRefreshToken(raw)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(raw)).toBe(hashRefreshToken(raw));
    expect(hashRefreshToken(raw)).not.toBe(raw);
    expect(hashRefreshToken(newRawRefreshToken())).not.toBe(hashRefreshToken(raw));
  });
});

describe('createRefreshFamily', () => {
  beforeEach(resetDb);
  afterAll(() => testPrisma.$disconnect());

  it('stores only the hash, in a new family, expiring after REFRESH_TOKEN_TTL_DAYS', async () => {
    const user = await testPrisma.user.create({ data: buildUser() });

    const issued = await createRefreshFamily(testPrisma, user.id);

    const rows = await testPrisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tokenHash: hashRefreshToken(issued.raw),
      revokedAt: null,
      replacedById: null,
    });
    expect(JSON.stringify(rows)).not.toContain(issued.raw);
    const ttlSeconds = (issued.expiresAt.getTime() - Date.now()) / 1000;
    expect(ttlSeconds).toBeGreaterThan(expectedRefreshCookie.maxAgeSeconds - 60);
    expect(ttlSeconds).toBeLessThanOrEqual(expectedRefreshCookie.maxAgeSeconds);
  });

  it('starts a separate family for each login', async () => {
    const user = await testPrisma.user.create({ data: buildUser() });

    await createRefreshFamily(testPrisma, user.id);
    await createRefreshFamily(testPrisma, user.id);

    const families = await testPrisma.refreshToken.groupBy({
      by: ['familyId'],
      where: { userId: user.id },
    });
    expect(families).toHaveLength(2);
  });
});

describe('refresh cookie path', () => {
  it('matches the API prefix, so only /auth endpoints receive the cookie', () => {
    expect(REFRESH_COOKIE_PATH).toBe(`${API_PREFIX}/auth`);
  });
});
