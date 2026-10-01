import { lockContainer, settlePosition } from '../../lib/rebalance';
import { logActivity } from '../boards/boards.service';

import type { Prisma } from '../../generated/prisma/client';

// Card queries that need more than one statement (backend.md → Repository): the move transaction.

export interface CardMove {
  cardId: string;
  userId: string;
  from: { listId: string; boardId: string };
  to: { listId: string; boardId: string };
  position: number;
}

/**
 * PATCH /cards/:cardId/move, steps 2–6 of docs/api/cards.md → Transaction (step 1, the access
 * checks, runs in cards.service before the transaction):
 * 2. lock the target list's card rows; 3. set `listId`, `boardId` (from the target list, I1) and
 * `position`; 4. on another board, drop labels of the old board (I2; card labels arrive with
 * CARD-005, which adds that step here); 5. rebalance the target list if the threshold is hit;
 * 6. log CARD_MOVED. Returns the card with its final position.
 */
export async function move(tx: Prisma.TransactionClient, move: CardMove) {
  const { cardId, userId, from, to } = move;
  await lockContainer(tx, 'Card', 'listId', to.listId);
  const moved = await tx.card.update({
    where: { id: cardId },
    data: { listId: to.listId, boardId: to.boardId, position: move.position },
  });
  const position = await settlePosition(tx, 'Card', 'listId', to.listId, cardId);
  await logActivity(tx, {
    // The card's (new) board: the move shows in the target board's feed.
    boardId: to.boardId,
    userId,
    cardId,
    type: 'CARD_MOVED',
    data: {
      fromListId: from.listId,
      toListId: to.listId,
      fromBoardId: from.boardId,
      toBoardId: to.boardId,
    },
  });
  return { ...moved, position };
}
