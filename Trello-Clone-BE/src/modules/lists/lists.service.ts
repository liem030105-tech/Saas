import { toListDto } from './lists.mapper';
import { prisma } from '../../config/prisma';
import { Prisma, type List } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import { lockAttachmentKeys } from '../../lib/attachment-files';
import { appendPosition, lockContainer, settle } from '../../lib/rebalance';
import { removeFiles } from '../../lib/storage';
import {
  listCreated,
  listDeleted,
  listMoved,
  listsReordered,
  listUpdated,
} from '../../realtime/events/lists.events';
import { assertBoardAccess, logActivity } from '../boards/boards.service';

import type { CreateListData, ListDto, UpdateListData } from '@trello-clone/shared';

// docs/api/lists.md. Every endpoint authorizes with assertBoardAccess on the stored board.

/** The board was deleted between the access check and the insert (a concurrent DELETE). */
const isMissingBoard = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';

/** The list was deleted between the access check and the write (a concurrent DELETE). */
const isMissingList = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

/**
 * Resolves a list to its stored board and checks the caller's role there. An unknown or malformed
 * id and a list on a board the caller cannot see are the same 404.
 */
async function assertListAccess(userId: string, listId: string) {
  const list = await prisma.list.findUnique({ where: { id: listId }, select: { boardId: true } });
  if (!list) throw AppError.notFound();
  const { board } = await assertBoardAccess(userId, list.boardId, 'list.manage');
  return { boardId: list.boardId, workspaceId: board.workspaceId };
}

/**
 * POST /boards/:boardId/lists (≥ MEMBER). Without `position` the list goes after the board's last
 * list (archived ones included, so it never lands between them and a later unarchive). A client
 * `position` goes through the rebalance check. The board's lists are locked first, so once the
 * board has a list, concurrent creates and moves on it run one at a time (two first lists created
 * at the same moment may share a position; the `id` tie-break orders them).
 */
export async function create(
  userId: string,
  boardId: string,
  input: CreateListData,
): Promise<ListDto> {
  const { board } = await assertBoardAccess(userId, boardId, 'list.manage');
  const where = { boardId, workspaceId: board.workspaceId };
  let rebalanced: Map<string, number> | null = null;
  let list: List;
  try {
    list = await prisma.$transaction(async (tx) => {
      await lockContainer(tx, 'List', 'boardId', boardId);
      const position = input.position ?? (await appendPosition(tx, 'List', 'boardId', boardId));
      let created = await tx.list.create({ data: { boardId, title: input.title, position } });
      if (input.position !== undefined) {
        const settled = await settle(tx, 'List', 'boardId', boardId, created.id);
        created = { ...created, position: settled.position };
        rebalanced = settled.rebalanced;
      }
      await logActivity(tx, {
        boardId,
        userId,
        type: 'LIST_CREATED',
        data: { listId: created.id, title: created.title },
      });
      return created;
    });
  } catch (error) {
    if (isMissingBoard(error)) throw AppError.notFound();
    throw error;
  }
  // After the commit (realtime.md → Principles), outside the error mapping.
  const dto = toListDto(list);
  listCreated(where, userId, list, dto);
  if (rebalanced) listsReordered(where, userId, rebalanced);
  return dto;
}

/**
 * PATCH /lists/:listId (≥ MEMBER): rename, archive or unarchive, move. Archiving logs
 * LIST_ARCHIVED, otherwise a move logs LIST_MOVED, and anything else LIST_UPDATED; each with the
 * changed fields (a move with the final position), in the same transaction. A move locks the
 * board's lists first and may rebalance them; the response carries the final stored position.
 * An archived list keeps its position, so unarchiving puts it back where it was.
 */
export async function update(
  userId: string,
  listId: string,
  input: UpdateListData,
): Promise<ListDto> {
  const where = await assertListAccess(userId, listId);
  const { boardId } = where;
  let rebalanced: Map<string, number> | null = null;
  const changes = {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.archived !== undefined && { archived: input.archived }),
    ...(input.position !== undefined && { position: input.position }),
  };
  const moved = input.position !== undefined;
  let list: List;
  try {
    list = await prisma.$transaction(async (tx) => {
      if (moved) await lockContainer(tx, 'List', 'boardId', boardId);
      let updated = await tx.list.update({ where: { id: listId }, data: changes });
      if (moved) {
        const settled = await settle(tx, 'List', 'boardId', boardId, listId);
        updated = { ...updated, position: settled.position };
        rebalanced = settled.rebalanced;
      }
      await logActivity(tx, {
        boardId,
        userId,
        type: changes.archived === true ? 'LIST_ARCHIVED' : moved ? 'LIST_MOVED' : 'LIST_UPDATED',
        data: { listId, ...changes, ...(moved && { position: updated.position }) },
      });
      return updated;
    });
  } catch (error) {
    if (isMissingList(error)) throw AppError.notFound();
    throw error;
  }
  const dto = toListDto(list);
  if (input.title !== undefined || input.archived !== undefined) {
    listUpdated(where, userId, list, dto);
  }
  if (moved) listMoved(where, userId, list);
  if (rebalanced) listsReordered(where, userId, rebalanced);
  return dto;
}

/** DELETE /lists/:listId (≥ MEMBER): its cards go with it (cascade, from CARD-001). */
export async function remove(userId: string, listId: string): Promise<void> {
  const where = await assertListAccess(userId, listId);
  let files: string[];
  try {
    files = await prisma.$transaction(async (tx) => {
      const keys = await lockAttachmentKeys(tx, { listId });
      await tx.list.delete({ where: { id: listId } });
      return keys;
    });
  } catch (error) {
    if (isMissingList(error)) throw AppError.notFound();
    throw error;
  }
  await removeFiles(files); // its cards' attachment files, after the commit (ATTACHMENTS-001)
  listDeleted(where, userId, listId);
}
