import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { boardChangeKey, boardKeys } from '@/features/boards';

import { cardKeys, cardMutationScope, refetchCardWhenIdle, withCard } from '../queries';

import type { BoardDetailDto, CardDetailDto, LabelDto, UserSummary } from '@trello-clone/shared';

/** What can be put on a card and taken off: its labels (CARD-005a) and members (CARD-005b). */
interface OnCard {
  labels: LabelDto;
  members: UserSummary;
}

/** Where a kind's ids live on the board tile (CardSummaryDto). */
const SUMMARY_IDS = { labels: 'labelIds', members: 'memberIds' } as const;

interface ToggleApi {
  attach: (cardId: string, id: string) => Promise<unknown>;
  detach: (cardId: string, id: string) => Promise<unknown>;
  error: string;
}

/** Ordered as the API lists them: by id. */
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Puts an item (a label, a member) on the card or takes it off, optimistic on both the modal and
 * the board tile. It runs in the card's mutation scope (queries.ts): requests go in turn while
 * every click shows immediately (`onMutate` runs at once), and a failed toggle undoes only itself
 * on the caches as they are now.
 */
export function useToggleOnCard<Kind extends keyof OnCard>(
  boardId: string,
  cardId: string,
  kind: Kind,
  api: ToggleApi,
) {
  type Item = OnCard[Kind];
  const queryClient = useQueryClient();
  const cardKey = cardKeys.detail(cardId);
  const boardKey = boardKeys.detail(boardId);
  const summaryIds = SUMMARY_IDS[kind];

  /** Shows `item` on (or off) the card in the modal's and the board's caches. */
  const show = (item: Item, on: boolean) => {
    queryClient.setQueryData<CardDetailDto>(cardKey, (card) => {
      if (!card) return card;
      // TypeScript cannot narrow `card[kind]` by a generic key; both kinds are lists of { id }.
      const current: readonly { id: string }[] = card[kind];
      const others = current.filter((x) => x.id !== item.id);
      return { ...card, [kind]: on ? [...others, item].sort(byId) : others };
    });
    queryClient.setQueryData<BoardDetailDto>(boardKey, (board) =>
      board
        ? withCard(board, cardId, (card) => {
            const ids = card[summaryIds].filter((id) => id !== item.id);
            return { ...card, [summaryIds]: on ? [...ids, item.id].sort() : ids };
          })
        : board,
    );
  };
  return useMutation({
    scope: cardMutationScope(cardId),
    mutationKey: boardChangeKey(boardId),
    mutationFn: ({ item, on }: { item: Item; on: boolean }) =>
      on ? api.attach(cardId, item.id) : api.detach(cardId, item.id),
    onMutate: async ({ item, on }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: cardKey }),
        queryClient.cancelQueries({ queryKey: boardKey }),
      ]);
      show(item, on);
    },
    onError: (_error, { item, on }) => {
      show(item, !on);
      toast.error(api.error);
    },
    onSettled: () => refetchCardWhenIdle(queryClient, boardId, cardId),
  });
}
