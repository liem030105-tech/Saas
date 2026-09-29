import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

import { env } from '../../config/env';

import type { Prisma } from '../../generated/prisma/client';

// Token mechanics: docs/architecture/security.md → Authentication flow.

const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const DAY_MS = 24 * 60 * 60 * 1000;

/** JWT HS256 `{ sub, iat, exp }`, valid for ACCESS_TOKEN_TTL (D-01). Roles are never embedded. */
export function issueAccessToken(userId: string): Promise<string> {
  return new SignJWT()
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(accessKey);
}

/**
 * Verifies an access token (HS256 only, signature and `exp`) and returns its user id. Throws on an
 * expired, malformed, or wrongly signed token, or one without a `sub`.
 */
export async function verifyAccessToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, accessKey, { algorithms: ['HS256'] });
  if (typeof payload.sub !== 'string' || payload.sub === '') throw new Error('Token without sub');
  return payload.sub;
}

/** 256-bit random value, base64url. Only its hash is stored; the raw value goes to the cookie. */
export const newRawRefreshToken = () => randomBytes(32).toString('base64url');

/** sha256 (hex) of a raw refresh token; the value kept in RefreshToken.tokenHash. */
export const hashRefreshToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

export interface IssuedRefreshToken {
  /** The raw token, for the cookie only. Never logged or stored. */
  raw: string;
  /** Absolute expiry of the whole family (D-02): rotations keep it. */
  expiresAt: Date;
}

/** Starts a new login's token family: one row holding only the hash. Runs inside the caller's transaction. */
export async function createRefreshFamily(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<IssuedRefreshToken> {
  const raw = newRawRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
  await tx.refreshToken.create({
    data: { userId, familyId: randomUUID(), tokenHash: hashRefreshToken(raw), expiresAt },
  });
  return { raw, expiresAt };
}
