import {
  createRefreshFamily,
  hashRefreshToken,
  issueAccessToken,
  newRawRefreshToken,
  type IssuedRefreshToken,
} from './tokens';
import { prisma } from '../../config/prisma';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import { hashPassword, verifyPassword } from '../../lib/password';
import { toUserDto } from '../users/users.service';

import type { LoginData, RegisterData, UserDto } from '@trello-clone/shared';

export interface AuthResult {
  user: UserDto;
  accessToken: string;
  refreshToken: IssuedRefreshToken;
}

const emailTaken = () => new AppError('CONFLICT', 409, 'An account with this email already exists');

/** One error for an unknown email and a wrong password: the response never reveals which. */
const invalidCredentials = () =>
  new AppError('INVALID_CREDENTIALS', 401, 'Incorrect email or password');

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * POST /auth/register (docs/api/authentication.md). The email arrives trimmed and lower-cased
 * (RegisterInputSchema), so the uniqueness check is case-insensitive. Does not create a
 * workspace (D-06 → WORKSPACE-001).
 */
export async function register(input: RegisterData): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) throw emailTaken();

  const passwordHash = await hashPassword(input.password);

  try {
    const { user, refreshToken } = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash },
      });
      return { user: created, refreshToken: await createRefreshFamily(tx, created.id) };
    });
    return { user: toUserDto(user), accessToken: await issueAccessToken(user.id), refreshToken };
  } catch (error) {
    // Two registrations with the same email at once: the unique index decides.
    if (isUniqueViolation(error)) throw emailTaken();
    throw error;
  }
}

/**
 * POST /auth/login (docs/api/authentication.md). An unknown email still runs one bcrypt compare
 * (against the dummy hash), so it fails like a wrong password, with similar timing.
 */
export async function login(input: LoginData): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const valid = await verifyPassword(input.password, user?.passwordHash ?? null);
  if (!user || !valid) throw invalidCredentials();

  const refreshToken = await createRefreshFamily(prisma, user.id);
  return { user: toUserDto(user), accessToken: await issueAccessToken(user.id), refreshToken };
}

/** A replayed (already rotated or revoked) refresh token: the whole family is revoked. */
const tokenReused = () =>
  new AppError('TOKEN_REUSED', 401, 'Your session has expired. Log in again.');

const revokeFamily = (familyId: string) =>
  prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

/**
 * POST /auth/refresh (docs/api/authentication.md; flow in docs/architecture/security.md). The
 * presented token is found by its hash. A valid one is revoked and replaced in the same family,
 * keeping the family's absolute expiry (D-02), and a new access token is issued. A revoked one is
 * a replay: the whole family is revoked → 401 TOKEN_REUSED. Missing, unknown, or expired → 401.
 */
export async function refresh(
  presentedRaw: string | undefined,
): Promise<{ accessToken: string; refreshToken: IssuedRefreshToken }> {
  if (!presentedRaw) throw AppError.unauthorized();
  const presented = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(presentedRaw) },
  });
  if (!presented || presented.expiresAt <= new Date()) throw AppError.unauthorized();

  if (presented.revokedAt) {
    await revokeFamily(presented.familyId);
    throw tokenReused();
  }

  const raw = newRawRefreshToken();
  const rotated = await prisma.$transaction(async (tx) => {
    // Conditional revoke: if a concurrent request already rotated this token, nothing matches.
    const { count } = await tx.refreshToken.updateMany({
      where: { id: presented.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count !== 1) return false;
    const next = await tx.refreshToken.create({
      data: {
        userId: presented.userId,
        familyId: presented.familyId,
        tokenHash: hashRefreshToken(raw),
        expiresAt: presented.expiresAt,
      },
    });
    await tx.refreshToken.update({ where: { id: presented.id }, data: { replacedById: next.id } });
    return true;
  });
  if (!rotated) {
    // The same token was presented twice at once: treated as reuse, per the spec.
    await revokeFamily(presented.familyId);
    throw tokenReused();
  }

  return {
    accessToken: await issueAccessToken(presented.userId),
    refreshToken: { raw, expiresAt: presented.expiresAt },
  };
}
