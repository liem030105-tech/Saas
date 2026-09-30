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

/**
 * GET /boards/:boardId in one query. Lists (LIST-001), cards (CARD-001) and labels (CARD-005) join
 * this select as their tables arrive; the mapper already returns them (empty until then).
 */
export function findDetail(boardId: string) {
  return prisma.board.findUnique({ where: { id: boardId } });
}
