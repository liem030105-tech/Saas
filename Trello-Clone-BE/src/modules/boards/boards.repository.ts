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

/**
 * GET /boards/:boardId in one query after the access check: the board with its non-archived lists
 * (LIST-001), each with its non-archived cards (CARD-001). Labels (CARD-005) join as they arrive.
 */
export function findDetail(boardId: string) {
  return prisma.board.findUnique({
    where: { id: boardId },
    include: {
      lists: {
        where: { archived: false },
        orderBy: [...BY_POSITION],
        include: { cards: { where: { archived: false }, orderBy: [...BY_POSITION] } },
      },
    },
  });
}
