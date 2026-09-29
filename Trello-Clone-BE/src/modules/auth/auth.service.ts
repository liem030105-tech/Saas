import { createRefreshFamily, issueAccessToken, type IssuedRefreshToken } from './tokens';
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
