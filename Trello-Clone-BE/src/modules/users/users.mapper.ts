import type { User } from '../../generated/prisma/client';
import type { UserDto } from '@trello-clone/shared';

/** The only way a User leaves the API: explicit fields, so passwordHash can never leak. */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
  };
}
