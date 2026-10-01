import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { initialPosition, positionAfter } from '@trello-clone/shared';
import { toast } from 'sonner';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { boardKeys } from '@/features/boards';

import { listsApi } from './api';

import type { BoardDetailDto, UpdateListInput } from '@trello-clone/shared';

type BoardList = BoardDetailDto['lists'][number];

const OPTIMISTIC_ID_PREFIX = 'optimistic-list-';
let optimisticIds = 0;

/** A list shown before the server created it: it has no real id yet, so it cannot be edited. */
export const isOptimisticList = (list: Pick<BoardList, 'id'>) =>
  list.id.startsWith(OPTIMISTIC_ID_PREFIX);

/**
 * One board's list adds and moves share a mutation scope, so their requests run one at a time
 * (each move computes its position when its request starts, from the cache the previous one left).
 */
export const listsScope = (boardId: string) => ({ id: `lists:${boardId}` });

/**
 * Refetches the board after a list add or move, but only once the last one in the board's scope
 * settles: an earlier refetch would bring server data without the later optimistic changes and
 * make those lists jump back and forth.
 */
export function refetchBoardWhenIdle(queryClient: QueryClient, boardId: string) {
  const { id } = listsScope(boardId);
  const pending = queryClient.isMutating({ predicate: (m) => m.options.scope?.id === id });
  if (pending > 1) return; // this mutation still counts as pending while it settles
  return queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) });
}

const CREATE_ERROR = "Couldn't add the list. Check your connection and try again.";
const SAVE_ERROR = "Couldn't save the list. Check your connection and try again.";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError && error.code !== NETWORK_ERROR_CODE ? error.message : fallback;

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
    scope: listsScope(boardId),
    mutationFn: (title: string) => listsApi.create(boardId, { title }),
    onMutate: async (title) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardDetailDto>(key);
      if (previous) {
        const now = new Date().toISOString();
        optimisticIds += 1;
        const predicted: BoardList = {
          id: `${OPTIMISTIC_ID_PREFIX}${optimisticIds}`,
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
    onSettled: () => refetchBoardWhenIdle(queryClient, boardId),
  });
}

/** A list in the board cache, by id: for toasts that name it after it left the board. */
type ListRef = Pick<BoardList, 'id' | 'title'>;

/**
 * PATCH /lists/:listId with an optimistic update: a rename shows at once, and an archived list
 * leaves the board at once. Errors roll back with a toast; archiving says so when it succeeds.
 * The toasts live here because the list's header unmounts as soon as it is archived.
 */
export function useUpdateList(boardId: string) {
  const queryClient = useQueryClient();
  const key = boardKeys.detail(boardId);

  return useMutation({
    mutationFn: ({ list, input }: { list: ListRef; input: UpdateListInput }) =>
      listsApi.update(list.id, input),
    onMutate: async ({ list, input }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardDetailDto>(key);
      if (previous) {
        const lists = input.archived
          ? previous.lists.filter((item) => item.id !== list.id)
          : previous.lists.map((item) =>
              item.id === list.id && input.title !== undefined
                ? { ...item, title: input.title }
                : item,
            );
        queryClient.setQueryData<BoardDetailDto>(key, { ...previous, lists });
      }
      return { previous };
    },
    onSuccess: (_updated, { list, input }) => {
      if (input.archived) toast.success(`${list.title} was archived.`);
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(errorMessage(error, SAVE_ERROR));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/**
 * DELETE /lists/:listId. Not optimistic on purpose: it runs from a confirmation dialog inside the
 * list, which must stay open to show an error; the list leaves the cache once the server agrees.
 */
export function useDeleteList(boardId: string) {
  const queryClient = useQueryClient();
  const key = boardKeys.detail(boardId);

  return useMutation({
    mutationFn: (listId: string) => listsApi.remove(listId),
    onSuccess: (_result, listId) => {
      queryClient.setQueryData<BoardDetailDto>(key, (board) =>
        board ? { ...board, lists: board.lists.filter((list) => list.id !== listId) } : board,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
