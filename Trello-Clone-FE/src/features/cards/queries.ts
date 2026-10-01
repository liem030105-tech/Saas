import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { initialPosition, positionAfter } from '@trello-clone/shared';
import { toast } from 'sonner';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { boardKeys, boardMutationScope, refetchBoardWhenIdle } from '@/features/boards';

import { cardsApi } from './api';

import type {
  BoardDetailDto,
  CardDetailDto,
  CardSummaryDto,
  UpdateCardInput,
} from '@trello-clone/shared';

const CREATE_ERROR = "Couldn't add the card. Check your connection and try again.";
const SAVE_ERROR = "Couldn't save the card. Check your connection and try again.";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError && error.code !== NETWORK_ERROR_CODE ? error.message : fallback;

// Query keys: docs/architecture/frontend.md → State management (`['card', cardId]`).
export const cardKeys = {
  detail: (cardId: string) => ['card', cardId] as const,
};

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

/** The card modal's data (GET /cards/:cardId). */
export function useCard(cardId: string | undefined) {
  return useQuery({
    queryKey: cardKeys.detail(cardId ?? ''),
    queryFn: () => cardsApi.get(cardId!),
    enabled: cardId !== undefined,
  });
}

/** The board cache with `cardId`'s summary changed (or removed, when archived or deleted). */
function withCard(
  board: BoardDetailDto,
  cardId: string,
  change: (card: CardSummaryDto) => CardSummaryDto | null,
): BoardDetailDto {
  return {
    ...board,
    lists: board.lists.map((list) => ({
      ...list,
      cards: list.cards.flatMap((card) => {
        if (card.id !== cardId) return [card];
        const changed = change(card);
        return changed ? [changed] : [];
      }),
    })),
  };
}

/**
 * PATCH /cards/:cardId with an optimistic update of both the modal and the board tile (an archived
 * card leaves the board at once). Errors roll both back with a toast; the card and the board are
 * refetched either way.
 */
export function useUpdateCard(boardId: string, cardId: string) {
  const queryClient = useQueryClient();
  const cardKey = cardKeys.detail(cardId);
  const boardKey = boardKeys.detail(boardId);

  return useMutation({
    mutationFn: (input: UpdateCardInput) => cardsApi.update(cardId, input),
    onMutate: async (input) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: cardKey }),
        queryClient.cancelQueries({ queryKey: boardKey }),
      ]);
      const previousCard = queryClient.getQueryData<CardDetailDto>(cardKey);
      const previousBoard = queryClient.getQueryData<BoardDetailDto>(boardKey);
      const title = input.title?.trim();
      const fields = {
        ...(title !== undefined && { title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
        ...(input.completed !== undefined && { completed: input.completed }),
        ...(input.archived !== undefined && { archived: input.archived }),
      };
      if (previousCard) queryClient.setQueryData(cardKey, { ...previousCard, ...fields });
      if (previousBoard) {
        // The tile shows the title, due date and completed state; an archived card leaves it.
        const summary = {
          ...(fields.title !== undefined && { title: fields.title }),
          ...(fields.dueDate !== undefined && { dueDate: fields.dueDate }),
          ...(fields.completed !== undefined && { completed: fields.completed }),
        };
        queryClient.setQueryData(
          boardKey,
          withCard(previousBoard, cardId, (card) =>
            fields.archived ? null : { ...card, ...summary },
          ),
        );
      }
      return { previousCard, previousBoard };
    },
    onError: (error, _input, context) => {
      if (context?.previousCard) queryClient.setQueryData(cardKey, context.previousCard);
      if (context?.previousBoard) queryClient.setQueryData(boardKey, context.previousBoard);
      toast.error(errorMessage(error, SAVE_ERROR));
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: cardKey });
      await refetchBoardWhenIdle(queryClient, boardId);
    },
  });
}

/**
 * DELETE /cards/:cardId. Not optimistic: it runs from a confirmation dialog in the card modal,
 * which must stay open to show an error. The card leaves the board once the server agrees; the
 * caller drops the card's own query with `useForgetCard` once the modal has closed (dropping it
 * while the modal watches it would refetch and flash "Page not found").
 */
export function useDeleteCard(boardId: string, cardId: string) {
  const queryClient = useQueryClient();
  const boardKey = boardKeys.detail(boardId);

  return useMutation({
    mutationFn: () => cardsApi.remove(cardId),
    onSuccess: () => {
      queryClient.setQueryData<BoardDetailDto>(boardKey, (board) =>
        board ? withCard(board, cardId, () => null) : board,
      );
    },
    onSettled: () => refetchBoardWhenIdle(queryClient, boardId),
  });
}

/**
 * Drops a deleted card's query, so going back to its URL asks the server again (and gets the
 * 404) instead of showing the cached card.
 */
export function useForgetCard() {
  const queryClient = useQueryClient();
  return (cardId: string) => queryClient.removeQueries({ queryKey: cardKeys.detail(cardId) });
}
