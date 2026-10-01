import type { Board, Card, Label, List } from '../../generated/prisma/client';
import type {
  BoardDetailDto,
  BoardDto,
  CardSummaryDto,
  LabelDto,
  ListDto,
} from '@trello-clone/shared';

/** A card with its label and member ids (boards.repository), as CardSummaryDto needs it. */
export type CardSummaryRow = Card & {
  labels: { labelId: string }[];
  members: { userId: string }[];
  _count: { comments: number };
  /** Done and total checklist items over all the card's checklists (CARD-005c). */
  checklist: ChecklistProgress;
};

export interface ChecklistProgress {
  done: number;
  total: number;
}

export const NO_CHECKLIST: ChecklistProgress = { done: 0, total: 0 };

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
  board: Board & {
    lists: (List & { cards: Omit<CardSummaryRow, 'checklist'>[] })[];
    labels: Label[];
  },
  checklistProgressOf: (cardId: string) => ChecklistProgress,
): BoardDetailDto {
  return {
    ...toBoardDto(board),
    lists: board.lists.map((list) => ({
      ...toDetailListDto(list),
      cards: list.cards.map((card) =>
        toCardSummaryDto({ ...card, checklist: checklistProgressOf(card.id) }),
      ),
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
 * shape (the cards module reaches it through boards.service).
 */
export function toCardSummaryDto(card: CardSummaryRow): CardSummaryDto {
  return {
    id: card.id,
    listId: card.listId,
    title: card.title,
    position: card.position,
    dueDate: card.dueDate?.toISOString() ?? null,
    completed: card.completed,
    coverUrl: card.coverUrl,
    labelIds: card.labels.map((label) => label.labelId),
    memberIds: card.members.map((member) => member.userId),
    checklist: card.checklist,
    commentCount: card._count.comments,
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

/** CardSummaryDto.checklist from a card's loaded checklists (the card modal has them anyway). */
export function checklistProgress(checklists: { items: { done: boolean }[] }[]): ChecklistProgress {
  const items = checklists.flatMap((checklist) => checklist.items);
  return { done: items.filter((item) => item.done).length, total: items.length };
}
