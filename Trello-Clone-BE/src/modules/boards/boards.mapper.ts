import type { Board, Card, Label, List } from '../../generated/prisma/client';
import type {
  BoardDetailDto,
  BoardDto,
  CardSummaryDto,
  LabelDto,
  ListDto,
} from '@trello-clone/shared';

/** A card with its label ids (boards.repository CARD_LABEL_IDS), as CardSummaryDto needs it. */
export type CardWithLabelIds = Card & { labels: { labelId: string }[] };

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

/** docs/api/boards.md → BoardDetailDto. */
export function toBoardDetailDto(
  board: Board & { lists: (List & { cards: CardWithLabelIds[] })[]; labels: Label[] },
): BoardDetailDto {
  return {
    ...toBoardDto(board),
    lists: board.lists.map((list) => ({
      ...toDetailListDto(list),
      cards: list.cards.map(toCardSummaryDto),
    })),
    labels: board.labels.map(toLabelDto),
  };
}

/** docs/api/boards.md → LabelDto. */
export function toLabelDto(label: Label): LabelDto {
  return { id: label.id, boardId: label.boardId, name: label.name, color: label.color };
}

/**
 * docs/api/boards.md → CardSummaryDto: a card as the board shows it. The boards module owns this
 * shape (the cards module reaches it through boards.service). Members, checklist and comment
 * counts arrive with the rest of CARD-005 and are empty or zero until then.
 */
export function toCardSummaryDto(card: CardWithLabelIds): CardSummaryDto {
  return {
    id: card.id,
    listId: card.listId,
    title: card.title,
    position: card.position,
    dueDate: card.dueDate?.toISOString() ?? null,
    completed: card.completed,
    coverUrl: card.coverUrl,
    labelIds: card.labels.map((label) => label.labelId),
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
