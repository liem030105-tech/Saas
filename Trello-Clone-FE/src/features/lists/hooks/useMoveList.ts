import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { boardKeys } from '@/features/boards';

import { listsApi } from '../api';
import { positionBetweenNeighbours } from '../positions';
import { listsScope, refetchBoardWhenIdle } from '../queries';

import type { BoardDetailDto } from '@trello-clone/shared';

const MOVE_ERROR = "Couldn't move the list. Try again.";

type BoardList = BoardDetailDto['lists'][number];

/** Sorted like the server sorts: `position`, then `id` (docs/database/relationships.md). */
const byPosition = (a: BoardList, b: BoardList) =>
  a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const withPosition = (board: BoardDetailDto, listId: string, position: number) => ({
  ...board,
  lists: board.lists
    .map((list) => (list.id === listId ? { ...list, position } : list))
    .sort(byPosition),
});

/** Where a list goes: between these neighbours (by id) in the board's new order. */
export interface ListMove {
  listId: string;
  beforeId: string | null;
  afterId: string | null;
}

/** The position between the move's neighbours, read from `board` as it is now. */
function positionFor(board: BoardDetailDto | undefined, { beforeId, afterId }: ListMove) {
  const positionOf = (id: string | null) =>
    id === null ? undefined : board?.lists.find((list) => list.id === id)?.position;
  return positionBetweenNeighbours(positionOf(beforeId), positionOf(afterId));
}

/**
 * PATCH /lists/:listId with a new `position` (LIST-003), optimistic: the list moves at once, rolls
 * back with a toast on error, and the board is refetched once the board's last add or move has
 * settled. That refetch is how the server's final positions arrive: after a rebalance every list is
 * renumbered, so patching only the moved list would tie it with stale neighbours and make it jump.
 *
 * Moves are given as neighbours, not positions: one board's adds and moves run one at a time, and
 * each request computes its position from the cache when it starts. When the server rebalanced,
 * the board is refetched before the next one starts, so it never sends a position computed from
 * numbers the rebalance replaced.
 */
export function useMoveList(boardId: string) {
  const queryClient = useQueryClient();
  const key = boardKeys.detail(boardId);
  const board = () => queryClient.getQueryData<BoardDetailDto>(key);

  return useMutation({
    scope: listsScope(boardId),
    mutationFn: async (move: ListMove) => {
      const position = positionFor(board(), move);
      const moved = await listsApi.update(move.listId, { position });
      return { moved, sent: position };
    },
    onMutate: async (move) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = board();
      if (previous) {
        queryClient.setQueryData(
          key,
          withPosition(previous, move.listId, positionFor(previous, move)),
        );
      }
      return { previous };
    },
    onSuccess: async ({ moved, sent }) => {
      // A rebalance renumbered the board: load it before the next move computes its position.
      if (moved.position !== sent) await queryClient.refetchQueries({ queryKey: key });
    },
    onError: (_error, _move, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(MOVE_ERROR);
    },
    onSettled: () => refetchBoardWhenIdle(queryClient, boardId),
  });
}
