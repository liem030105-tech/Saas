import { prisma } from '../../config/prisma';

// Board queries reused by every board-scoped check (backend.md → Repository).

/**
 * The board with the caller's membership in its workspace, in one query. The workspace comes from
 * the stored board, never from the client (tenant isolation rule 1).
 */
export function findBoardWithRole(userId: string, boardId: string) {
  return prisma.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      workspaceId: true,
      workspace: { select: { members: { where: { userId }, select: { role: true } } } },
    },
  });
}

/** Sort order of every ordered container (docs/database/relationships.md → Ordering). */
const BY_POSITION = [{ position: 'asc' }, { id: 'asc' }] as const;

/** A card's label and member ids and its checklist items' state, as CardSummaryDto needs them. */
const CARD_SUMMARY_IDS = {
  labels: { select: { labelId: true }, orderBy: { labelId: 'asc' } },
  members: { select: { userId: true }, orderBy: { userId: 'asc' } },
  checklists: { select: { items: { select: { done: true } } } },
} as const;

/**
 * GET /boards/:boardId in one query after the access check: the board with its non-archived lists
 * (LIST-001), each with its non-archived cards (CARD-001) and their label ids, and the board's labels
 * (CARD-005).
 */
export function findDetail(boardId: string) {
  return prisma.board.findUnique({
    where: { id: boardId },
    include: {
      lists: {
        where: { archived: false },
        orderBy: [...BY_POSITION],
        include: {
          cards: {
            where: { archived: false },
            orderBy: [...BY_POSITION],
            include: CARD_SUMMARY_IDS,
          },
        },
      },
      labels: { orderBy: { id: 'asc' } },
    },
  });
}
