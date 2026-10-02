import { PAGINATION, type SearchCardsQuery } from '@trello-clone/shared';

import { prisma } from '../../config/prisma';

import type { Prisma } from '../../generated/prisma/client';

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

/**
 * One card as the board shows it (CardSummaryDto's ids and counts, plus its checklist progress),
 * for the `card:updated` realtime event; null if it was deleted.
 */
export async function findCardSummary(cardId: string) {
  const [card, progress] = await Promise.all([
    prisma.card.findUnique({ where: { id: cardId }, include: CARD_SUMMARY_IDS }),
    prisma.$queryRaw<{ done: number; total: number }[]>`
      SELECT (COUNT(*) FILTER (WHERE i."done"))::int AS done, COUNT(*)::int AS total
      FROM "ChecklistItem" i
      JOIN "Checklist" cl ON cl."id" = i."checklistId"
      WHERE cl."cardId" = ${cardId}`,
  ]);
  return card && { card, checklist: progress[0] ?? { done: 0, total: 0 } };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * GET /boards/:boardId/search (SEARCH-001): the board's open cards in open lists that match every
 * given filter, in board order (list, then card position), at most PAGINATION.maxLimit (D-14). `q` matches the
 * title or description case-insensitively, as typed (`%`, `_` and `\` are not wildcards). `now`
 * is when "overdue" and "this week" are measured from.
 */
export function searchCards(boardId: string, query: SearchCardsQuery, now: Date) {
  const where: Prisma.CardWhereInput[] = [{ boardId, archived: false, list: { archived: false } }];
  if (query.q) {
    // Prisma's `contains` sends the text as a LIKE pattern as is: escape its wildcards.
    const pattern = query.q.replace(/[\\%_]/g, (char) => `\\${char}`);
    where.push({
      OR: [
        { title: { contains: pattern, mode: 'insensitive' } },
        { description: { contains: pattern, mode: 'insensitive' } },
      ],
    });
  }
  if (query.labelId) where.push({ labels: { some: { labelId: query.labelId } } });
  if (query.memberId) where.push({ members: { some: { userId: query.memberId } } });
  if (query.due === 'none') where.push({ dueDate: null });
  if (query.due === 'overdue') where.push({ completed: false, dueDate: { lt: now } });
  if (query.due === 'week') {
    where.push({ completed: false, dueDate: { gte: now, lt: new Date(now.getTime() + WEEK_MS) } });
  }
  return prisma.card.findMany({
    where: { AND: where },
    orderBy: [{ list: { position: 'asc' } }, { listId: 'asc' }, ...BY_POSITION],
    take: PAGINATION.maxLimit, // D-14
    include: CARD_SUMMARY_IDS,
  });
}
