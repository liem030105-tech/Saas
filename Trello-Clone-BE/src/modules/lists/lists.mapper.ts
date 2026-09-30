import type { List } from '../../generated/prisma/client';
import type { ListDto } from '@trello-clone/shared';

/** docs/api/lists.md → ListDto (boards.mapper projects the lists of a BoardDetailDto the same way). */
export function toListDto(list: List): ListDto {
  return {
    id: list.id,
    boardId: list.boardId,
    title: list.title,
    position: list.position,
    archived: list.archived,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };
}
