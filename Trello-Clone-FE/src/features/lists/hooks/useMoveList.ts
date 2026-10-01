import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { boardKeys } from '@/features/boards';

import { listsApi } from '../api';

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

/**
 * PATCH /lists/:listId with a new `position` (LIST-003), optimistic: the list moves at once, rolls
 * back with a toast on error, and the board is refetched either way. The refetch is also how the
 * server's final positions arrive: after a rebalance every list is renumbered, so patching only the
 * moved list would tie it with stale neighbours and make it jump. One board's moves (and adds) run
 * one at a time, so each is computed from the result of the previous one.
 */
export function useMoveList(boardId: string) {
  const queryClient = useQueryClient();
  const key = boardKeys.detail(boardId);

  return useMutation({
    scope: { id: `lists:${boardId}` },
    mutationFn: ({ listId, position }: { listId: string; position: number }) =>
      listsApi.update(listId, { position }),
    onMutate: async ({ listId, position }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardDetailDto>(key);
      if (previous) queryClient.setQueryData(key, withPosition(previous, listId, position));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(MOVE_ERROR);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
