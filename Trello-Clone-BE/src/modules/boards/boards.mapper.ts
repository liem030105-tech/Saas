import type { Board, List } from '../../generated/prisma/client';
import type { BoardDetailDto, BoardDto, ListDto } from '@trello-clone/shared';

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

/**
 * docs/api/boards.md → BoardDetailDto. Cards arrive with CARD-001 and labels with CARD-005; until
 * then both are empty.
 */
export function toBoardDetailDto(board: Board & { lists: List[] }): BoardDetailDto {
  return {
    ...toBoardDto(board),
    lists: board.lists.map((list) => ({ ...toDetailListDto(list), cards: [] })),
    labels: [],
  };
}

/**
 * A list inside BoardDetailDto. lists.mapper has the same projection for the lists endpoints, but
 * a module may not import another module's mapper (backend.md → cross-module) and going through
 * lists.service would be a cycle; the shared `ListDto` type keeps the two in step.
 */
function toDetailListDto(list: List): ListDto {
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
