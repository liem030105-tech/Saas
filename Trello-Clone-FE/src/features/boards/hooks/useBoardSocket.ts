import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { createEventDedupe, joinRoom, onEvent, onReconnect } from '@/lib/socket';

import { activityKeys, boardKeys, ownBoardChangePending } from '../queries';
import { applyBoardEvent, BOARD_EVENTS } from '../realtime';

import type { BoardDetailDto } from '@trello-clone/shared';

/**
 * Keeps the cached board in step with everyone else's changes (REALTIME-001,
 * docs/architecture/realtime.md → FE synchronization rules): joins `board:{boardId}` while
 * mounted and patches the cache with each event (the server leaves this tab's own changes out:
 * X-Socket-Id), except
 * - repeats (by `eventId`);
 * - while one of this tab's own changes to the board is pending (`ownBoardChangePending`): that
 *   change refetches the board when it settles, which brings this event along;
 * and refetches the board (and its activity) after a reconnect, as events may have been missed.
 */
export function useBoardSocket(boardId: string, userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!boardId || !userId) return;
    const key = boardKeys.detail(boardId);
    const isNew = createEventDedupe();
    const refetch = () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: activityKeys.board(boardId) });
    };

    const leave = joinRoom('board:join', { boardId });
    const unsubscribe = BOARD_EVENTS.map((type) =>
      onEvent(type, (event) => {
        if (event.boardId !== boardId && type !== 'card:moved') return;
        if (!isNew(event.eventId)) return;
        // The activity feed (if open) learns about it too.
        void queryClient.invalidateQueries({ queryKey: activityKeys.board(boardId) });
        if (ownBoardChangePending(queryClient, boardId)) return;
        const board = queryClient.getQueryData<BoardDetailDto>(key);
        if (!board) return;
        const next = applyBoardEvent(board, event);
        if (next === 'refetch') void queryClient.invalidateQueries({ queryKey: key });
        else if (next !== board) queryClient.setQueryData(key, next);
      }),
    );
    const offReconnect = onReconnect(refetch);
    return () => {
      leave();
      for (const off of unsubscribe) off();
      offReconnect();
    };
  }, [boardId, userId, queryClient]);
}
