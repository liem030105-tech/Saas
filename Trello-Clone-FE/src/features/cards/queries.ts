import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { initialPosition, positionAfter } from '@trello-clone/shared';
import { toast } from 'sonner';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import {
  activityKeys,
  boardChangeKey,
  boardKeys,
  boardMutationScope,
  refetchBoardWhenIdle,
  SIGNED_URL_REFRESH_MS,
} from '@/features/boards';

import { cardsApi } from './api';

import type { QueryClient } from '@tanstack/react-query';
import type {
  BoardDetailDto,
  CardDetailDto,
  CardSummaryDto,
  UpdateCardInput,
} from '@trello-clone/shared';

const CREATE_ERROR = "Couldn't add the card. Check your connection and try again.";
const SAVE_ERROR = "Couldn't save the card. Check your connection and try again.";

/** The API's message for an error it explains, otherwise `fallback` (offline, timeout, …). */
export const errorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError && error.code !== NETWORK_ERROR_CODE ? error.message : fallback;

// Query keys: docs/architecture/frontend.md → State management (`['card', cardId]`).
export const cardKeys = {
  all: ['card'] as const,
  detail: (cardId: string) => ['card', cardId] as const,
};

/**
 * One card's changes made from its modal (fields, labels, members, checklists, attachments) share
 * this mutation scope: they send their requests in turn, in the order they were made. An upload
 * holds the scope while it runs, so edits made meanwhile show at once but are sent after it.
 */
export const cardMutationScope = (cardId: string) => ({ id: `card-detail:${cardId}` });

/**
 * After one of those changes settles: only the last pending one refetches the card, so an earlier
 * one never brings back server data without the later ones; and the board is refetched only when
 * no list or card move is pending (that move refetches it when it settles).
 */
export async function refetchCardWhenIdle(
  queryClient: QueryClient,
  boardId: string,
  cardId: string,
) {
  const pendingIn = (id: string) =>
    queryClient.isMutating({ predicate: (m) => m.options.scope?.id === id });
  const othersPending = () => pendingIn(cardMutationScope(cardId).id) > 1; // this one still counts
  if (othersPending()) return;
  // The card's activity (when shown) follows its changes (CARD-005e).
  void queryClient.invalidateQueries({ queryKey: activityKeys.board(boardId) });
  await queryClient.invalidateQueries({ queryKey: cardKeys.detail(cardId) });
  // A change made while the card was refetching settles later and refetches the board itself.
  if (othersPending() || pendingIn(boardMutationScope(boardId).id) > 0) return;
  await queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) });
}

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
    // Fresh signed URLs for the card's files before they expire (D-27).
    refetchInterval: ({ state }) =>
      state.data?.attachments.length ? SIGNED_URL_REFRESH_MS : false,
  });
}

/** The board cache with `cardId`'s summary changed (or removed, when archived or deleted). */
export function withCard(
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
 * card leaves the board at once). It runs in the card's mutation scope with the modal's other
 * changes; an error puts back only the fields it changed, with a toast.
 */
export function useUpdateCard(boardId: string, cardId: string) {
  const queryClient = useQueryClient();
  const cardKey = cardKeys.detail(cardId);
  const boardKey = boardKeys.detail(boardId);

  return useMutation({
    scope: cardMutationScope(cardId),
    mutationKey: boardChangeKey(boardId),
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
        // A cover is one of the card's attachments: its URL is known already (ATTACHMENTS-001).
        ...(input.coverAttachmentId !== undefined && {
          coverAttachmentId: input.coverAttachmentId,
          coverUrl:
            previousCard?.attachments.find((file) => file.id === input.coverAttachmentId)?.url ??
            null,
        }),
      };
      if (previousCard) queryClient.setQueryData(cardKey, { ...previousCard, ...fields });
      if (previousBoard) {
        // The tile shows the title, due date, completed state and cover; an archived card leaves it.
        const summary = {
          ...(fields.title !== undefined && { title: fields.title }),
          ...(fields.coverUrl !== undefined && { coverUrl: fields.coverUrl }),
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
      // What a failure puts back: only the fields this change touched (later changes stay).
      const before = <K extends keyof CardDetailDto>(keys: K[]) =>
        previousCard
          ? Object.fromEntries(keys.filter((key) => key in fields).map((k) => [k, previousCard[k]]))
          : {};
      return {
        card: before([
          'title',
          'description',
          'dueDate',
          'completed',
          'archived',
          'coverAttachmentId',
          'coverUrl',
        ]),
        tile: before(['title', 'dueDate', 'completed', 'coverUrl']),
        // An archive removed the tile; only the board as it was can put it back.
        previousBoard: input.archived !== undefined ? previousBoard : undefined,
      };
    },
    onError: (error, _input, context) => {
      if (context) {
        queryClient.setQueryData<CardDetailDto>(cardKey, (card) =>
          card ? { ...card, ...context.card } : card,
        );
        if (context.previousBoard) queryClient.setQueryData(boardKey, context.previousBoard);
        else {
          queryClient.setQueryData<BoardDetailDto>(boardKey, (board) =>
            board ? withCard(board, cardId, (card) => ({ ...card, ...context.tile })) : board,
          );
        }
      }
      toast.error(errorMessage(error, SAVE_ERROR));
    },
    onSettled: () => refetchCardWhenIdle(queryClient, boardId, cardId),
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
