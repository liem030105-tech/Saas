import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { createEventDedupe, onEvent } from '@/lib/socket';

import { cardKeys, cardMutationScope } from '../queries';

import type { RealtimeEventType } from '@trello-clone/shared';

// Events that change what the card modal shows (its fields, labels, members, checklists, comment
// count, list, or the card being gone). The board page is in the board's room already.
const CARD_EVENTS = [
  'card:updated',
  'card:moved',
  'card:deleted',
] as const satisfies readonly RealtimeEventType[];

/**
 * While the card modal is open: a change to this card made elsewhere (another user, or this user
 * in another tab; never this tab, see api/socket-id.ts) refetches it (REALTIME-001),
 * so the modal shows it too; a deleted card's refetch answers 404 ("Page not found").
 */
export function useCardSocket(cardId: string, userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const isNew = createEventDedupe();
    const offs = CARD_EVENTS.map((type) =>
      onEvent(type, (event) => {
        const id = 'cardId' in event.data ? event.data.cardId : event.data.id;
        if (id !== cardId || !isNew(event.eventId)) return;
        // A change made in this modal is pending: it refetches the card when it settles.
        const { id: scope } = cardMutationScope(cardId);
        if (queryClient.isMutating({ predicate: (m) => m.options.scope?.id === scope }) > 0) return;
        void queryClient.invalidateQueries({ queryKey: cardKeys.detail(cardId) });
      }),
    );
    return () => {
      for (const off of offs) off();
    };
  }, [cardId, userId, queryClient]);
}
