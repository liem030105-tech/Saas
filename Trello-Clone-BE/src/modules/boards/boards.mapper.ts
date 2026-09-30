import type { Board } from '../../generated/prisma/client';
import type { BoardDetailDto, BoardDto } from '@trello-clone/shared';

/** docs/api/boards.md → BoardDto. */
export function toBoardDto(board: Board): BoardDto {
  return {
    id: board.id,
    workspaceId: board.workspaceId,
    title: board.title,
    background: board.background,
    archived: board.archived,
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
  };
}

/** docs/api/boards.md → BoardDetailDto: no lists or labels exist before LIST-001 and CARD-005. */
export function toBoardDetailDto(board: Board): BoardDetailDto {
  return { ...toBoardDto(board), lists: [], labels: [] };
}
