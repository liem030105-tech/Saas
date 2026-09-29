import { createRefreshFamily, issueAccessToken, type IssuedRefreshToken } from './tokens';
import { prisma } from '../../config/prisma';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import { hashPassword } from '../../lib/password';
import { toUserDto } from '../users/users.service';

import type { RegisterData, UserDto } from '@trello-clone/shared';

export interface AuthResult {
  user: UserDto;
  accessToken: string;
  refreshToken: IssuedRefreshToken;
}

const emailTaken = () => new AppError('CONFLICT', 409, 'An account with this email already exists');

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
