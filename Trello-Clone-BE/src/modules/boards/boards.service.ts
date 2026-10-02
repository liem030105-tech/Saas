import { logActivity } from './activity';
import {
  NO_CHECKLIST,
  toActivityDto,
  toBoardDetailDto,
  toBoardDto,
  toCardSummaryDto,
  toLabelDto,
} from './boards.mapper';
import * as boardsRepository from './boards.repository';
import { prisma } from '../../config/prisma';
import { Prisma, type Board } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import { lockAttachmentKeys } from '../../lib/attachment-files';
import { removeFiles, signedFileUrl } from '../../lib/storage';
import { boardCreated, boardDeleted, boardUpdated } from '../../realtime/events/boards.events';
import { hasPermission, type WorkspaceAction } from '../workspaces/permissions';

import type {
  ActivitiesPage,
  BoardDetailDto,
  BoardDto,
  CreateBoardData,
  CreateLabelData,
  LabelDto,
  ListActivitiesQuery,
  ListBoardsQuery,
  SearchCardsQuery,
  CardSummaryDto,
  UpdateBoardData,
  UpdateLabelData,
} from '@trello-clone/shared';

/** Other modules log board activity through this service (backend.md → Cross-module). */
export { logActivity } from './activity';
/** The cards module answers with the board's card shape (docs/api/boards.md → CardSummaryDto). */
export { checklistProgress, NO_CHECKLIST, toCardSummaryDto, toLabelDto } from './boards.mapper';

/** The labels every new board starts with: colour-only, in this order (docs/api/boards.md). */
export const DEFAULT_LABEL_COLORS = [
  '#61bd4f',
  '#f2d600',
  '#ff9f1a',
  '#eb5a46',
  '#c377e0',
  '#0079bf',
] as const;

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

/**
 * POST /workspaces/:workspaceId/boards (≥ MEMBER): the board, its default labels and its
 * BOARD_CREATED entry.
 */
export async function create(
  userId: string,
  workspaceId: string,
  input: CreateBoardData,
): Promise<BoardDto> {
  const board = await prisma.$transaction(async (tx) => {
    const created = await tx.board.create({
      data: { workspaceId, title: input.title, background: input.background },
    });
    // One by one, so their ids (which order the labels) follow DEFAULT_LABEL_COLORS.
    for (const color of DEFAULT_LABEL_COLORS) {
      await tx.label.create({ data: { boardId: created.id, color } });
    }
    await logActivity(tx, {
      boardId: created.id,
      userId,
      type: 'BOARD_CREATED',
      data: { title: created.title },
    });
    return created;
  });
  const dto = toBoardDto(board);
  boardCreated(userId, board, dto); // after the commit (realtime.md → Principles)
  return dto;
}

/** The board was deleted between the access check and this query (e.g. a concurrent DELETE). */
const isNotFound = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

/**
 * A card as its board tile shows it, with `archived` (the `card:updated` realtime payload); null
 * if it was deleted meanwhile. Read after a change commits, for the event only.
 */
export async function loadCardSummary(cardId: string) {
  const found = await boardsRepository.findCardSummary(cardId);
  if (!found) return null;
  const { card, checklist } = found;
  const coverUrl = await signedFileUrl(card.coverAttachment);
  return {
    card,
    data: { ...toCardSummaryDto({ ...card, checklist, coverUrl }), archived: card.archived },
  };
}

/** GET /boards/:boardId (≥ VIEWER): archived boards stay viewable. */
export async function get(userId: string, boardId: string): Promise<BoardDetailDto> {
  await assertBoardAccess(userId, boardId, 'board.view');
  const [board, progress] = await Promise.all([
    boardsRepository.findDetail(boardId),
    boardsRepository.findChecklistProgress(boardId),
  ]);
  if (!board) throw AppError.notFound();
  // Covers get fresh signed URLs (ADR-020); signing is local, no request per card.
  const cards = board.lists.flatMap((list) => list.cards);
  const covers = new Map(
    await Promise.all(
      cards.map(async (card) => [card.id, await signedFileUrl(card.coverAttachment)] as const),
    ),
  );
  return toBoardDetailDto(
    board,
    (cardId) => progress.get(cardId) ?? NO_CHECKLIST,
    (cardId) => covers.get(cardId) ?? null,
  );
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
  let board: Board;
  try {
    board = await prisma.$transaction(async (tx) => {
      const updated = await tx.board.update({ where: { id: boardId }, data: changes });
      await logActivity(tx, { boardId, userId, type: 'BOARD_UPDATED', data: changes });
      return updated;
    });
  } catch (error) {
    if (isNotFound(error)) throw AppError.notFound();
    throw error;
  }
  const dto = toBoardDto(board);
  boardUpdated(userId, board, dto); // after the commit, outside the error mapping
  return dto;
}

/** DELETE /boards/:boardId (≥ ADMIN): lists, cards and the activity log go with it (cascade). */
export async function remove(userId: string, boardId: string): Promise<void> {
  const { board } = await assertBoardAccess(userId, boardId, 'board.delete');
  let files: string[];
  try {
    files = await prisma.$transaction(async (tx) => {
      const keys = await lockAttachmentKeys(tx, { boardId });
      await tx.board.delete({ where: { id: boardId } });
      return keys;
    });
  } catch (error) {
    if (isNotFound(error)) throw AppError.notFound();
    throw error;
  }
  await removeFiles(files); // its cards' attachment files, after the commit (ATTACHMENTS-001)
  boardDeleted(userId, boardId, board.workspaceId);
}

// Labels (CARD-005, docs/api/boards.md → Labels). A label resolves to its stored board; an unknown
// or malformed id and a label the caller cannot see are the same 404.

/** Loads a label and checks the caller's role on its board. */
async function assertLabelAccess(userId: string, labelId: string, action: WorkspaceAction) {
  const label = await prisma.label.findUnique({ where: { id: labelId } });
  if (!label) throw AppError.notFound();
  await assertBoardAccess(userId, label.boardId, action);
  return label;
}

const ACTOR = { user: { select: { id: true, name: true, avatarUrl: true } } } as const;

/**
 * GET /boards/:boardId/search (≥ VIEWER, SEARCH-001): the board's open cards matching every given
 * filter (boards.repository.searchCards), as the board shows them.
 */
export async function search(
  userId: string,
  boardId: string,
  query: SearchCardsQuery,
): Promise<CardSummaryDto[]> {
  await assertBoardAccess(userId, boardId, 'board.view');
  const [cards, progress] = await Promise.all([
    boardsRepository.searchCards(boardId, query, new Date()),
    boardsRepository.findChecklistProgress(boardId),
  ]);
  return Promise.all(
    cards.map(async (card) =>
      toCardSummaryDto({
        ...card,
        checklist: progress.get(card.id) ?? NO_CHECKLIST,
        coverUrl: await signedFileUrl(card.coverAttachment),
      }),
    ),
  );
}

/**
 * GET /boards/:boardId/activities (≥ VIEWER): the board's activity, newest first (`id` breaks
 * ties), one page after `cursor`; with `cardId`, only that card's entries on this board.
 */
export async function listActivities(
  userId: string,
  boardId: string,
  query: ListActivitiesQuery,
): Promise<ActivitiesPage> {
  await assertBoardAccess(userId, boardId, 'board.view');
  if (query.cardId) {
    // The card must be on this board now; otherwise it is not found here (docs/api/boards.md).
    const card = await prisma.card.findFirst({ where: { id: query.cardId, boardId } });
    if (!card) throw AppError.notFound();
  }
  const scope: Prisma.ActivityWhereInput = {
    boardId,
    ...(query.cardId && { cardId: query.cardId }),
  };
  let after: Prisma.ActivityWhereInput = {};
  if (query.cursor) {
    // The cursor must be an entry of this feed, else it is a bad request (docs/api/README.md).
    const from = await prisma.activity.findFirst({ where: { id: query.cursor, ...scope } });
    if (!from) {
      throw new AppError('VALIDATION_ERROR', 400, 'Request validation failed', [
        { path: 'cursor', message: 'Unknown cursor' },
      ]);
    }
    after = {
      OR: [
        { createdAt: { lt: from.createdAt } },
        { createdAt: from.createdAt, id: { lt: from.id } },
      ],
    };
  }
  const rows = await prisma.activity.findMany({
    where: { ...scope, ...after },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: ACTOR,
    take: query.limit + 1,
  });
  const page = rows.slice(0, query.limit);
  return {
    data: page.map(toActivityDto),
    nextCursor: rows.length > query.limit ? page.at(-1)!.id : null,
  };
}

/** GET /boards/:boardId/labels (≥ VIEWER), in creation order. */
export async function listLabels(userId: string, boardId: string): Promise<LabelDto[]> {
  await assertBoardAccess(userId, boardId, 'board.view');
  const labels = await prisma.label.findMany({ where: { boardId }, orderBy: { id: 'asc' } });
  return labels.map(toLabelDto);
}

/** POST /boards/:boardId/labels (≥ MEMBER). */
export async function createLabel(
  userId: string,
  boardId: string,
  input: CreateLabelData,
): Promise<LabelDto> {
  await assertBoardAccess(userId, boardId, 'label.manage');
  try {
    const label = await prisma.label.create({
      data: { boardId, name: input.name, color: input.color },
    });
    return toLabelDto(label);
  } catch (error) {
    // The board was deleted after the check.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw AppError.notFound();
    }
    throw error;
  }
}

/** PATCH /labels/:labelId (≥ MEMBER): rename or recolour. */
export async function updateLabel(
  userId: string,
  labelId: string,
  input: UpdateLabelData,
): Promise<LabelDto> {
  await assertLabelAccess(userId, labelId, 'label.manage');
  try {
    const label = await prisma.label.update({
      where: { id: labelId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.color !== undefined && { color: input.color }),
      },
    });
    return toLabelDto(label);
  } catch (error) {
    if (isNotFound(error)) throw AppError.notFound();
    throw error;
  }
}

/** DELETE /labels/:labelId (≥ MEMBER): the label leaves every card it was on (cascade). */
export async function removeLabel(userId: string, labelId: string): Promise<void> {
  await assertLabelAccess(userId, labelId, 'label.manage');
  try {
    await prisma.label.delete({ where: { id: labelId } });
  } catch (error) {
    if (isNotFound(error)) throw AppError.notFound();
    throw error;
  }
}
