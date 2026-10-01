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

/** A card's label and member ids and its comment count, as CardSummaryDto carries them (CARD-005). */
const CARD_SUMMARY_IDS = {
  labels: { select: { labelId: true }, orderBy: { labelId: 'asc' } },
  members: { select: { userId: true }, orderBy: { userId: 'asc' } },
  _count: { select: { comments: true } },
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

/**
 * CardSummaryDto.checklist for the board's open cards (CARD-005c): two numbers per card, counted
 * by the database, so the board load never reads checklist items (docs/architecture/database.md
 * → Performance). Cards without items are left out.
 */
export async function findChecklistProgress(boardId: string) {
  const rows = await prisma.$queryRaw<{ cardId: string; done: number; total: number }[]>`
    SELECT cl."cardId",
           (COUNT(*) FILTER (WHERE i."done"))::int AS done,
           COUNT(*)::int AS total
    FROM "ChecklistItem" i
    JOIN "Checklist" cl ON cl."id" = i."checklistId"
    JOIN "Card" c ON c."id" = cl."cardId"
    WHERE c."boardId" = ${boardId} AND c."archived" = false
    GROUP BY cl."cardId"`;
  return new Map(rows.map(({ cardId, done, total }) => [cardId, { done, total }]));
}
