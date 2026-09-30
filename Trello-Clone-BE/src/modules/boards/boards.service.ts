import { logActivity } from './activity';
import { toBoardDetailDto, toBoardDto } from './boards.mapper';
import * as boardsRepository from './boards.repository';
import { prisma } from '../../config/prisma';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import { hasPermission, type WorkspaceAction } from '../workspaces/permissions';

import type {
  BoardDetailDto,
  BoardDto,
  CreateBoardData,
  ListBoardsQuery,
  UpdateBoardData,
} from '@trello-clone/shared';

/** Other modules log board activity through this service (backend.md → Cross-module). */
export { logActivity } from './activity';

// docs/api/boards.md. Board-scoped endpoints (BOARD-002 onwards) authorize with assertBoardAccess;
// the workspace-scoped ones below rely on requireWorkspaceRole on their route.

/**
 * The single entry point for board-scoped authorization: loads the board with the caller's role
 * in its workspace. A missing board and a non-member look the same (404); a member whose role does
 * not allow `action` gets 403.
 */
export async function assertBoardAccess(userId: string, boardId: string, action: WorkspaceAction) {
  const board = await boardsRepository.findBoardWithRole(userId, boardId);
  const role = board?.workspace.members[0]?.role;
  if (!board || !role) throw AppError.notFound();
  if (!hasPermission(role, action)) throw AppError.forbidden();
  return { board: { id: board.id, workspaceId: board.workspaceId }, role };
}

/** GET /workspaces/:workspaceId/boards (≥ VIEWER): newest first, archived or not. */
export async function list(workspaceId: string, query: ListBoardsQuery): Promise<BoardDto[]> {
  const boards = await prisma.board.findMany({
    where: { workspaceId, archived: query.archived },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return boards.map(toBoardDto);
}

/** POST /workspaces/:workspaceId/boards (≥ MEMBER): the board and its BOARD_CREATED entry. */
export async function create(
  userId: string,
  workspaceId: string,
  input: CreateBoardData,
): Promise<BoardDto> {
  const board = await prisma.$transaction(async (tx) => {
    const created = await tx.board.create({
      data: { workspaceId, title: input.title, background: input.background },
    });
    await logActivity(tx, {
      boardId: created.id,
      userId,
      type: 'BOARD_CREATED',
      data: { title: created.title },
    });
    return created;
  });
  return toBoardDto(board);
}

/** The board was deleted between the access check and this query (e.g. a concurrent DELETE). */
const isNotFound = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

/** GET /boards/:boardId (≥ VIEWER): archived boards stay viewable. */
export async function get(userId: string, boardId: string): Promise<BoardDetailDto> {
  await assertBoardAccess(userId, boardId, 'board.view');
  const board = await boardsRepository.findDetail(boardId);
  if (!board) throw AppError.notFound();
  return toBoardDetailDto(board);
}

/**
 * PATCH /boards/:boardId (≥ MEMBER): rename, recolour, archive or unarchive. Logs BOARD_UPDATED
 * with the changed fields, in the same transaction.
 */
export async function update(
  userId: string,
  boardId: string,
  input: UpdateBoardData,
): Promise<BoardDto> {
  await assertBoardAccess(userId, boardId, 'board.edit');
  const changes = {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.background !== undefined && { background: input.background }),
    ...(input.archived !== undefined && { archived: input.archived }),
  };
  try {
    const board = await prisma.$transaction(async (tx) => {
      const updated = await tx.board.update({ where: { id: boardId }, data: changes });
      await logActivity(tx, { boardId, userId, type: 'BOARD_UPDATED', data: changes });
      return updated;
    });
    return toBoardDto(board);
  } catch (error) {
    if (isNotFound(error)) throw AppError.notFound();
    throw error;
  }
}

/** DELETE /boards/:boardId (≥ ADMIN): lists, cards and the activity log go with it (cascade). */
export async function remove(userId: string, boardId: string): Promise<void> {
  await assertBoardAccess(userId, boardId, 'board.delete');
  try {
    await prisma.board.delete({ where: { id: boardId } });
  } catch (error) {
    if (isNotFound(error)) throw AppError.notFound();
    throw error;
  }
}
