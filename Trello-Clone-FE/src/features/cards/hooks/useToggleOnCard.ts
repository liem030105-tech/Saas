import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { boardKeys, refetchBoardWhenIdle } from '@/features/boards';

import { cardKeys, withCard } from '../queries';

import type { BoardDetailDto, CardDetailDto, CardSummaryDto } from '@trello-clone/shared';

/** What can be put on a card and taken off: its labels (CARD-005a) and members (CARD-005b). */
interface Toggled {
  /** The list on CardDetailDto and the ids on CardSummaryDto. */
  detail: 'labels' | 'members';
  summary: 'labelIds' | 'memberIds';
  attach: (cardId: string, id: string) => Promise<unknown>;
  detach: (cardId: string, id: string) => Promise<unknown>;
  error: string;
}

/** Ordered as the API lists them: by id. */
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Puts an item (a label, a member) on the card or takes it off, optimistic on both the modal and
 * the board tile. One card's toggles of a kind send their requests in turn (their `onMutate` runs
 * at once, so every click shows immediately). A failed toggle undoes only itself, on the caches as
 * they are now, so toggles made since stay; and only the last toggle to settle refetches, so an
 * earlier one never brings back server data without the later ones.
 */
export function useToggleOnCard<Item extends { id: string }>(
  boardId: string,
  cardId: string,
  toggled: Toggled,
) {
  const queryClient = useQueryClient();
  const cardKey = cardKeys.detail(cardId);
  const boardKey = boardKeys.detail(boardId);
  const scopeId = `card-${toggled.detail}:${cardId}`;

  /** Shows `item` on (or off) the card in the modal's and the board's caches. */
  const show = (item: Item, on: boolean) => {
    queryClient.setQueryData<CardDetailDto>(cardKey, (card) => {
      if (!card) return card;
      const others = (card[toggled.detail] as unknown as Item[]).filter((x) => x.id !== item.id);
      return { ...card, [toggled.detail]: on ? [...others, item].sort(byId) : others };
    });
    queryClient.setQueryData<BoardDetailDto>(boardKey, (board) =>
      board
        ? withCard(board, cardId, (card: CardSummaryDto) => {
            const ids = card[toggled.summary].filter((id) => id !== item.id);
            return { ...card, [toggled.summary]: on ? [...ids, item.id].sort() : ids };
          })
        : board,
    );
  };

  return useMutation({
    scope: { id: scopeId },
    mutationFn: ({ item, on }: { item: Item; on: boolean }) =>
      on ? toggled.attach(cardId, item.id) : toggled.detach(cardId, item.id),
    onMutate: async ({ item, on }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: cardKey }),
        queryClient.cancelQueries({ queryKey: boardKey }),
      ]);
      show(item, on);
    },
    onError: (_error, { item, on }) => {
      show(item, !on);
      toast.error(toggled.error);
    },
    onSettled: async () => {
      const pending = queryClient.isMutating({ predicate: (m) => m.options.scope?.id === scopeId });
      if (pending > 1) return; // this toggle still counts as pending while it settles
      await queryClient.invalidateQueries({ queryKey: cardKey });
      await refetchBoardWhenIdle(queryClient, boardId);
    },
  });
}
