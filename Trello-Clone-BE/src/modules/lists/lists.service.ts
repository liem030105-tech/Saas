import { initialPosition, positionAfter } from '@trello-clone/shared';

import { toListDto } from './lists.mapper';
import { prisma } from '../../config/prisma';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
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
  await assertBoardAccess(userId, list.boardId, 'list.manage');
  return list;
}

/**
 * POST /boards/:boardId/lists (≥ MEMBER). Without `position` the list goes after the board's last
 * list (archived ones included, so it never lands between them and a later unarchive). A client
 * `position` is stored as validated; the rebalance check arrives with LIST-003. Two concurrent
 * appends may get the same position: the `id` tie-break keeps the order deterministic.
 */
export async function create(
  userId: string,
  boardId: string,
  input: CreateListData,
): Promise<ListDto> {
  await assertBoardAccess(userId, boardId, 'list.manage');
  try {
    const list = await prisma.$transaction(async (tx) => {
      const position = input.position ?? (await nextPosition(tx, boardId));
      const created = await tx.list.create({ data: { boardId, title: input.title, position } });
      await logActivity(tx, {
        boardId,
        userId,
        type: 'LIST_CREATED',
        data: { listId: created.id, title: created.title },
      });
      return created;
    });
    return toListDto(list); // realtime emit (REALTIME-001) goes here, after the commit
  } catch (error) {
    if (isMissingBoard(error)) throw AppError.notFound();
    throw error;
  }
}

async function nextPosition(tx: Prisma.TransactionClient, boardId: string) {
  const { _max } = await tx.list.aggregate({ where: { boardId }, _max: { position: true } });
  return _max.position === null ? initialPosition() : positionAfter(_max.position);
}

/**
 * PATCH /lists/:listId (≥ MEMBER): rename, archive or unarchive. Archiving logs LIST_ARCHIVED;
 * any other change logs LIST_UPDATED; either way with the changed fields, in the same transaction.
 * An archived list keeps its position, so unarchiving puts it back where it was.
 */
export async function update(
  userId: string,
  listId: string,
  input: UpdateListData,
): Promise<ListDto> {
  const { boardId } = await assertListAccess(userId, listId);
  const changes = {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.archived !== undefined && { archived: input.archived }),
  };
  try {
    const list = await prisma.$transaction(async (tx) => {
      const updated = await tx.list.update({ where: { id: listId }, data: changes });
      await logActivity(tx, {
        boardId,
        userId,
        type: changes.archived === true ? 'LIST_ARCHIVED' : 'LIST_UPDATED',
        data: { listId, ...changes },
      });
      return updated;
    });
    return toListDto(list);
  } catch (error) {
    if (isMissingList(error)) throw AppError.notFound();
    throw error;
  }
}

/** DELETE /lists/:listId (≥ MEMBER): its cards go with it (cascade, from CARD-001). */
export async function remove(userId: string, listId: string): Promise<void> {
  await assertListAccess(userId, listId);
  try {
    await prisma.list.delete({ where: { id: listId } });
  } catch (error) {
    if (isMissingList(error)) throw AppError.notFound();
    throw error;
  }
}
