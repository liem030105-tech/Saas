import { AppError } from '../../lib/app-error';
import { lockContainers, settle } from '../../lib/rebalance';
import { logActivity } from '../boards/boards.service';

import type { Prisma } from '../../generated/prisma/client';

// Card queries that need more than one statement (backend.md → Repository): the move transaction.

export interface CardMove {
  cardId: string;
  userId: string;
  to: { listId: string; boardId: string };
  position: number;
}

/** How often the card's list may change under us before we give up (each retry is a new move). */
const MAX_LOCK_ATTEMPTS = 3;

/**
 * Locks the card's current list and the target list together (one id-ordered statement, so moves
 * in opposite directions cannot deadlock) and returns the card as it is under those locks. If a
 * concurrent move took the card to another list before the locks were granted, locks that one too.
 */
async function lockSourceAndTarget(tx: Prisma.TransactionClient, cardId: string, toListId: string) {
  let listId = (await tx.card.findUnique({ where: { id: cardId }, select: { listId: true } }))
    ?.listId;
  for (let attempt = 0; attempt < MAX_LOCK_ATTEMPTS; attempt += 1) {
    if (!listId) throw AppError.notFound(); // deleted meanwhile
    await lockContainers(tx, 'Card', 'listId', [listId, toListId]);
    const card = await tx.card.findUnique({ where: { id: cardId } });
    if (!card) throw AppError.notFound();
    if (card.listId === listId || card.listId === toListId) return card;
    listId = card.listId;
  }
  throw new AppError('CONFLICT', 409, 'The card is being moved by someone else; try again');
}

/**
 * PATCH /cards/:cardId/move, steps 2–6 of docs/api/cards.md → Transaction (step 1, the access
 * checks, runs in cards.service before the transaction):
 * 2. lock the card rows of its current list and of the target list (together, in id order);
 * 3. set `listId`, `boardId` (from the target list, I1) and `position`;
 * 4. on another board, drop the labels of the old board (I2; members stay, same workspace);
 * 5. rebalance the target list if the threshold is hit;
 * 6. log CARD_MOVED. Returns the card with its final position, where it was (`from`) and the
 *    target list's new positions if it was rebalanced (for the realtime events).
 */
export async function move(tx: Prisma.TransactionClient, move: CardMove) {
  const { cardId, userId, to } = move;
  const from = await lockSourceAndTarget(tx, cardId, to.listId);
  const moved = await tx.card.update({
    where: { id: cardId },
    data: { listId: to.listId, boardId: to.boardId, position: move.position },
  });
  if (from.boardId !== to.boardId) {
    await tx.cardLabel.deleteMany({ where: { cardId, label: { boardId: { not: to.boardId } } } });
  }
  const { position, rebalanced } = await settle(tx, 'Card', 'listId', to.listId, cardId);
  await logActivity(tx, {
    // The card's (new) board: the move shows in the target board's feed.
    boardId: to.boardId,
    userId,
    cardId,
    type: 'CARD_MOVED',
    // `from` is read under the locks, so it is where the card really was.
    data: {
      fromListId: from.listId,
      toListId: to.listId,
      fromBoardId: from.boardId,
      toBoardId: to.boardId,
    },
  });
  return {
    card: { ...moved, position },
    from: { listId: from.listId, boardId: from.boardId },
    rebalanced,
  };
}
