import { useMutation, useQueryClient } from '@tanstack/react-query';

import { boardKeys } from '@/features/boards';

import { labelsApi } from '../api';
import { cardKeys } from '../queries';
import { useToggleOnCard } from './useToggleOnCard';

import type {
  BoardDetailDto,
  CreateLabelInput,
  LabelDto,
  UpdateLabelInput,
} from '@trello-clone/shared';

const TOGGLE_ERROR = "Couldn't update the card's labels. Try again.";

/** Every open card's query: a label change shows on whichever card carries it. */
const ALL_CARDS = { queryKey: cardKeys.all };

/** Puts a label on the card or takes it off (POST / DELETE /cards/:cardId/labels/:labelId). */
export const useToggleCardLabel = (boardId: string, cardId: string) =>
  useToggleOnCard(boardId, cardId, 'labels', {
    attach: labelsApi.attach,
    detach: labelsApi.detach,
    error: TOGGLE_ERROR,
  });

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
