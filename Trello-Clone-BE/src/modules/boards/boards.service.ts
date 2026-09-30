import { logActivity } from './activity';
import { toBoardDto } from './boards.mapper';
import * as boardsRepository from './boards.repository';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import { hasPermission, type WorkspaceAction } from '../workspaces/permissions';

import type { BoardDto, CreateBoardData, ListBoardsQuery } from '@trello-clone/shared';

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
