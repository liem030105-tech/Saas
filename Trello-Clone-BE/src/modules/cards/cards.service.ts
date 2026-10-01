import { prisma } from '../../config/prisma';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import { appendPosition, lockContainer, settlePosition } from '../../lib/rebalance';
import { assertBoardAccess, logActivity, toCardSummaryDto } from '../boards/boards.service';

import type { CardSummaryDto, CreateCardData } from '@trello-clone/shared';

// docs/api/cards.md. Every endpoint authorizes with assertBoardAccess on the stored board.

/** The list was deleted between the access check and the insert (a concurrent DELETE). */
const isMissingList = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';

/**
 * POST /lists/:listId/cards (≥ MEMBER). The list resolves to its stored board, and the card's
 * `boardId` is copied from it (invariant I1; never from the client). Without `position` the card
 * goes after the list's last card (archived ones included); a client `position` goes through the
 * rebalance check. The list's cards are locked first, so concurrent adds to a list run in turn.
 * Logs CARD_CREATED with the card's id, in the same transaction.
 */
export async function create(
  userId: string,
  listId: string,
  input: CreateCardData,
): Promise<CardSummaryDto> {
  const list = await prisma.list.findUnique({ where: { id: listId }, select: { boardId: true } });
  if (!list) throw AppError.notFound();
  const { boardId } = list;
  await assertBoardAccess(userId, boardId, 'card.edit');
  try {
    const card = await prisma.$transaction(async (tx) => {
      await lockContainer(tx, 'Card', 'listId', listId);
      const position = input.position ?? (await appendPosition(tx, 'Card', 'listId', listId));
      let created = await tx.card.create({
        data: { boardId, listId, title: input.title, position },
      });
      if (input.position !== undefined) {
        created = {
          ...created,
          position: await settlePosition(tx, 'Card', 'listId', listId, created.id),
        };
      }
      await logActivity(tx, {
        boardId,
        userId,
        cardId: created.id,
        type: 'CARD_CREATED',
        data: { listId, title: created.title },
      });
      return created;
    });
    return toCardSummaryDto(card); // realtime emit (REALTIME-001) goes here, after the commit
  } catch (error) {
    if (isMissingList(error)) throw AppError.notFound();
    throw error;
  }
}
