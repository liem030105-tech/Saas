import { initialPosition, positionAfter } from '@trello-clone/shared';

import { toListDto } from './lists.mapper';
import { prisma } from '../../config/prisma';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import { assertBoardAccess, logActivity } from '../boards/boards.service';

import type { CreateListData, ListDto } from '@trello-clone/shared';

// docs/api/lists.md. Every endpoint authorizes with assertBoardAccess on the stored board.

/** The board was deleted between the access check and the insert (a concurrent DELETE). */
const isMissingBoard = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';

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
