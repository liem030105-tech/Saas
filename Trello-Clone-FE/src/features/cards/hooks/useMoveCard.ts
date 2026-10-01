import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { boardKeys, boardMutationScope, refetchBoardWhenIdle } from '@/features/boards';
import { positionBetweenNeighbours } from '@/lib/positions';

import { cardsApi } from '../api';

import type { BoardDetailDto, CardSummaryDto } from '@trello-clone/shared';

const MOVE_ERROR = "Couldn't move the card. Try again.";

/** Where a card goes: into `listId`, between these neighbours (by id) in that list's new order. */
export interface CardMove {
  cardId: string;
  listId: string;
  beforeId: string | null;
  afterId: string | null;
}

/** The position between the move's neighbours, read from `board` as it is now. */
function positionFor(board: BoardDetailDto | undefined, { listId, beforeId, afterId }: CardMove) {
  const cards = board?.lists.find((list) => list.id === listId)?.cards ?? [];
  const positionOf = (id: string | null) =>
    id === null ? undefined : cards.find((card) => card.id === id)?.position;
  return positionBetweenNeighbours(positionOf(beforeId), positionOf(afterId));
}

/** Sorted like the server sorts: `position`, then `id` (docs/database/relationships.md). */
const byPosition = (a: CardSummaryDto, b: CardSummaryDto) =>
  a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The board with the card taken out of its list and put into `listId` at `position`. */
export function withCardMoved(
  board: BoardDetailDto,
  cardId: string,
  listId: string,
  position: number,
): BoardDetailDto {
  const card = board.lists.flatMap((list) => list.cards).find((item) => item.id === cardId);
  if (!card) return board;
  const moved = { ...card, listId, position };
  return {
    ...board,
    lists: board.lists.map((list) => {
      const others = list.cards.filter((item) => item.id !== cardId);
      return {
        ...list,
        cards: list.id === listId ? [...others, moved].sort(byPosition) : others,
      };
    }),
  };
}

/**
 * PATCH /cards/:cardId/move (CARD-004), optimistic: the card moves at once, rolls back with a
 * toast on error, and the board is refetched once the board's last add or move has settled. A
 * move is given as its new neighbours: one board's adds and moves run one at a time, and each
 * request computes its position from the cache when it starts. When the server rebalanced the
 * list (its answer differs from what was sent), the board is refetched right away, so the next
 * move never uses numbers the rebalance replaced; otherwise the server's position is the one the
 * cache already shows.
 */
export function useMoveCard(boardId: string) {
  const queryClient = useQueryClient();
  const key = boardKeys.detail(boardId);
  const board = () => queryClient.getQueryData<BoardDetailDto>(key);

  return useMutation({
    scope: boardMutationScope(boardId),
    mutationFn: async (move: CardMove) => {
      const position = positionFor(board(), move);
      const moved = await cardsApi.move(move.cardId, { listId: move.listId, position });
      return { moved, sent: position };
    },
    onMutate: async (move) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = board();
      if (previous) {
        queryClient.setQueryData(
          key,
          withCardMoved(previous, move.cardId, move.listId, positionFor(previous, move)),
        );
      }
      return { previous };
    },
    onSuccess: async ({ moved, sent }) => {
      if (moved.position !== sent) await queryClient.refetchQueries({ queryKey: key });
    },
    onError: (_error, _move, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(MOVE_ERROR);
    },
    onSettled: () => refetchBoardWhenIdle(queryClient, boardId),
  });
}
