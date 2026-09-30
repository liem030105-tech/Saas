import { useMutation, useQueryClient } from '@tanstack/react-query';
import { initialPosition, positionAfter } from '@trello-clone/shared';
import { toast } from 'sonner';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { boardKeys } from '@/features/boards';

import { listsApi } from './api';

import type { BoardDetailDto } from '@trello-clone/shared';

type BoardList = BoardDetailDto['lists'][number];

let optimisticIds = 0;

const CREATE_ERROR = "Couldn't add the list. Check your connection and try again.";

/**
 * A best-effort guess at where the server appends a list (docs/database/relationships.md →
 * Ordering), from the visible lists only (the server also counts archived ones). It is used for
 * the optimistic update only; the request sends no position and the refetch brings the real one.
 */
export function predictAppendPosition(lists: readonly BoardList[]) {
  const last = lists.at(-1);
  return last ? positionAfter(last.position) : initialPosition();
}

/**
 * POST /boards/:boardId/lists with an optimistic update: the list shows at the end of the board at
 * once, rolls back (with a toast, even if the composer has closed) on error, and the board is
 * refetched either way. One board's adds run one at a time, so they are stored in typing order.
 */
export function useCreateList(boardId: string) {
  const queryClient = useQueryClient();
  const key = boardKeys.detail(boardId);

  return useMutation({
    scope: { id: `lists:${boardId}` },
    mutationFn: (title: string) => listsApi.create(boardId, { title }),
    onMutate: async (title) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardDetailDto>(key);
      if (previous) {
        const now = new Date().toISOString();
        optimisticIds += 1;
        const predicted: BoardList = {
          id: `optimistic-list-${optimisticIds}`,
          boardId,
          title,
          position: predictAppendPosition(previous.lists),
          archived: false,
          createdAt: now,
          updatedAt: now,
          cards: [],
        };
        queryClient.setQueryData<BoardDetailDto>(key, {
          ...previous,
          lists: [...previous.lists, predicted],
        });
      }
      return { previous };
    },
    onError: (error, _title, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(
        error instanceof ApiError && error.code !== NETWORK_ERROR_CODE
          ? error.message
          : CREATE_ERROR,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
