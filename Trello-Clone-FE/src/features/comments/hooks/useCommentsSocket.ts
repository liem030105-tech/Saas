import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { createEventDedupe, onEvent } from '@/lib/socket';

import { applyCommentEvent } from '../queries';

import type { RealtimeEventType } from '@trello-clone/shared';

const COMMENT_EVENTS = [
  'comment:created',
  'comment:updated',
  'comment:deleted',
] as const satisfies readonly RealtimeEventType[];

/**
 * While a card's comments are shown: a comment added, edited or deleted elsewhere (another user,
 * or another tab) is patched into them (REALTIME-001, see applyCommentEvent); this tab's own are
 * already in the list.
 */
export function useCommentsSocket(cardId: string, userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const isNew = createEventDedupe();
    const offs = COMMENT_EVENTS.map((type) =>
      onEvent(type, (event) => {
        if (event.data.cardId !== cardId) return;
        if (!isNew(event.eventId)) return;
        applyCommentEvent(
          queryClient,
          cardId,
          'commentId' in event.data
            ? { type: 'deleted', commentId: event.data.commentId }
            : { type: 'saved', comment: event.data },
        );
      }),
    );
    return () => {
      for (const off of offs) off();
    };
  }, [cardId, userId, queryClient]);
}
