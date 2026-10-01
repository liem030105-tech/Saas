import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { boardKeys, refetchBoardWhenIdle } from '@/features/boards';

import { labelsApi } from '../api';
import { byId } from '../labels';
import { cardKeys, withCard } from '../queries';

import type {
  BoardDetailDto,
  CardDetailDto,
  CreateLabelInput,
  LabelDto,
  UpdateLabelInput,
} from '@trello-clone/shared';

const TOGGLE_ERROR = "Couldn't update the card's labels. Try again.";

/** Every open card's query: a label change shows on whichever card carries it. */
const ALL_CARDS = { queryKey: ['card'] };

/**
 * Puts a label on the card or takes it off (POST / DELETE /cards/:cardId/labels/:labelId),
 * optimistic on both the modal and the board tile; an error rolls both back with a toast. One
 * card's label changes run in turn, so a rollback never undoes a later toggle.
 */
export function useToggleCardLabel(boardId: string, cardId: string) {
  const queryClient = useQueryClient();
  const cardKey = cardKeys.detail(cardId);
  const boardKey = boardKeys.detail(boardId);

  return useMutation({
    scope: { id: `card-labels:${cardId}` },
    mutationFn: ({ label, on }: { label: LabelDto; on: boolean }) =>
      on ? labelsApi.attach(cardId, label.id) : labelsApi.detach(cardId, label.id),
    onMutate: async ({ label, on }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: cardKey }),
        queryClient.cancelQueries({ queryKey: boardKey }),
      ]);
      const previousCard = queryClient.getQueryData<CardDetailDto>(cardKey);
      const previousBoard = queryClient.getQueryData<BoardDetailDto>(boardKey);
      const others = (previousCard?.labels ?? []).filter((item) => item.id !== label.id);
      const labels = on ? [...others, label].sort(byId) : others;
      if (previousCard) queryClient.setQueryData(cardKey, { ...previousCard, labels });
      if (previousBoard) {
        queryClient.setQueryData(
          boardKey,
          withCard(previousBoard, cardId, (card) => {
            const ids = card.labelIds.filter((id) => id !== label.id);
            return { ...card, labelIds: on ? [...ids, label.id].sort() : ids };
          }),
        );
      }
      return { previousCard, previousBoard };
    },
    onError: (_error, _toggle, context) => {
      if (context?.previousCard) queryClient.setQueryData(cardKey, context.previousCard);
      if (context?.previousBoard) queryClient.setQueryData(boardKey, context.previousBoard);
      toast.error(TOGGLE_ERROR);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: cardKey });
      await refetchBoardWhenIdle(queryClient, boardId);
    },
  });
}

/** The board cache with its labels changed by `change`, and each card's `labelIds` filtered. */
function withLabels(
  board: BoardDetailDto,
  change: (labels: LabelDto[]) => LabelDto[],
): BoardDetailDto {
  const labels = change(board.labels);
  const kept = new Set(labels.map((label) => label.id));
  return {
    ...board,
    labels,
    lists: board.lists.map((list) => ({
      ...list,
      cards: list.cards.map((card) => ({
        ...card,
        labelIds: card.labelIds.filter((id) => kept.has(id)),
      })),
    })),
  };
}

/**
 * Creates, edits and deletes the board's labels. Not optimistic: they run from the label picker,
 * which shows the error in place. On success the board's labels follow at once and open cards
 * are refetched (an edited or deleted label changes how they read).
 */
export function useLabelMutations(boardId: string) {
  const queryClient = useQueryClient();
  const boardKey = boardKeys.detail(boardId);
  const setLabels = (change: (labels: LabelDto[]) => LabelDto[]) =>
    queryClient.setQueryData<BoardDetailDto>(boardKey, (board) =>
      board ? withLabels(board, change) : board,
    );

  const create = useMutation({
    mutationFn: (input: CreateLabelInput) => labelsApi.create(boardId, input),
    onSuccess: (label) => setLabels((labels) => [...labels, label]),
  });
  const update = useMutation({
    mutationFn: ({ labelId, input }: { labelId: string; input: UpdateLabelInput }) =>
      labelsApi.update(labelId, input),
    onSuccess: async (label) => {
      setLabels((labels) => labels.map((item) => (item.id === label.id ? label : item)));
      await queryClient.invalidateQueries(ALL_CARDS);
    },
  });
  const remove = useMutation({
    mutationFn: (labelId: string) => labelsApi.remove(labelId),
    onSuccess: async (_result, labelId) => {
      setLabels((labels) => labels.filter((label) => label.id !== labelId));
      await queryClient.invalidateQueries(ALL_CARDS);
    },
  });
  return { create, update, remove };
}
