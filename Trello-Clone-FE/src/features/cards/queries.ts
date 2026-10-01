import { useMutation, useQueryClient } from '@tanstack/react-query';
import { initialPosition, positionAfter } from '@trello-clone/shared';
import { toast } from 'sonner';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { boardKeys, boardMutationScope, refetchBoardWhenIdle } from '@/features/boards';

import { cardsApi } from './api';

import type { BoardDetailDto, CardSummaryDto } from '@trello-clone/shared';

const CREATE_ERROR = "Couldn't add the card. Check your connection and try again.";

const OPTIMISTIC_ID_PREFIX = 'optimistic-card-';
let optimisticIds = 0;

/** A card shown before the server created it: it has no real id yet, so it cannot be opened. */
export const isOptimisticCard = (card: Pick<CardSummaryDto, 'id'>) =>
  card.id.startsWith(OPTIMISTIC_ID_PREFIX);

/** Where the server appends a card, from the visible cards (for the optimistic update only). */
function predictAppendPosition(cards: readonly CardSummaryDto[]) {
  const last = cards.at(-1);
  return last ? positionAfter(last.position) : initialPosition();
}

/**
 * POST /lists/:listId/cards with an optimistic update: the card shows at the end of its list at
 * once, rolls back with a toast on error (even if the composer has closed), and the board is
 * refetched once the board's last add or move has settled.
 */
export function useCreateCard(boardId: string, listId: string) {
  const queryClient = useQueryClient();
  const key = boardKeys.detail(boardId);

  return useMutation({
    scope: boardMutationScope(boardId),
    mutationFn: (title: string) => cardsApi.create(listId, { title }),
    onMutate: async (title) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardDetailDto>(key);
      if (previous) {
        optimisticIds += 1;
        const lists = previous.lists.map((list) =>
          list.id === listId
            ? {
                ...list,
                cards: [
                  ...list.cards,
                  {
                    id: `${OPTIMISTIC_ID_PREFIX}${optimisticIds}`,
                    listId,
                    title,
                    position: predictAppendPosition(list.cards),
                    dueDate: null,
                    completed: false,
                    coverUrl: null,
                    labelIds: [],
                    memberIds: [],
                    checklist: { done: 0, total: 0 },
                    commentCount: 0,
                  },
                ],
              }
            : list,
        );
        queryClient.setQueryData<BoardDetailDto>(key, { ...previous, lists });
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
