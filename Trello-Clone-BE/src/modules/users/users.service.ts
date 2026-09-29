import { toUserDto } from './users.mapper';
import { prisma } from '../../config/prisma';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';

import type { UpdateProfileData, UserDto } from '@trello-clone/shared';

// The users module's public API for other modules (backend.md → cross-module communication).
export { toUserDto } from './users.mapper';

/**
 * A valid access token whose user no longer exists (deleted since it was issued) is treated as
 * unauthenticated: the token outlives the account for at most its lifetime (D-01).
 */
const userGone = () => AppError.unauthorized();

/** GET /auth/me: the signed-in user. */
export async function getMe(userId: string): Promise<UserDto> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw userGone();
  return toUserDto(user);
}

/** PATCH /users/me: name and/or avatar URL (`null` removes it). Email changes are out of scope. */
export async function updateProfile(userId: string, input: UpdateProfileData): Promise<UserDto> {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { name: input.name, avatarUrl: input.avatarUrl },
    });
    return toUserDto(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw userGone();
    }
    throw error;
  }
}
