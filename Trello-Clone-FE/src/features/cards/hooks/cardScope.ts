import { boardKeys, boardMutationScope } from '@/features/boards';

import { cardKeys } from '../queries';

import type { QueryClient } from '@tanstack/react-query';

/**
 * One card's changes made from its modal (labels, members, checklists) share this mutation scope:
 * they send their requests in turn, in the order they were made.
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
  if (pendingIn(cardMutationScope(cardId).id) > 1) return; // this one still counts while it settles
  await queryClient.invalidateQueries({ queryKey: cardKeys.detail(cardId) });
  if (pendingIn(boardMutationScope(boardId).id) > 0) return;
  await queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) });
}
