import type { Board, Card, List } from '../../generated/prisma/client';
import type { BoardDetailDto, BoardDto, CardSummaryDto, ListDto } from '@trello-clone/shared';

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

/** docs/api/boards.md → BoardDetailDto. Labels arrive with CARD-005; until then they are empty. */
export function toBoardDetailDto(
  board: Board & { lists: (List & { cards: Card[] })[] },
): BoardDetailDto {
  return {
    ...toBoardDto(board),
    lists: board.lists.map((list) => ({
      ...toDetailListDto(list),
      cards: list.cards.map(toCardSummaryDto),
    })),
    labels: [],
  };
}

/**
 * docs/api/boards.md → CardSummaryDto: a card as the board shows it. The boards module owns this
 * shape (the cards module reaches it through boards.service). Labels, members, checklist and
 * comment counts arrive with CARD-005 and are empty or zero until then.
 */
export function toCardSummaryDto(card: Card): CardSummaryDto {
  return {
    id: card.id,
    listId: card.listId,
    title: card.title,
    position: card.position,
    dueDate: card.dueDate?.toISOString() ?? null,
    completed: card.completed,
    coverUrl: card.coverUrl,
    labelIds: [],
    memberIds: [],
    checklist: { done: 0, total: 0 },
    commentCount: 0,
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
