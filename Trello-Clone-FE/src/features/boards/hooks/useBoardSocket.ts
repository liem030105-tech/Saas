import { hashKey, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef } from 'react';

import { createEventDedupe, joinRoom, onEvent } from '@/lib/socket';

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
 * - while the board is being fetched: it is fetched once more when that fetch settles, as that
 *   answer may predate the event.
 * It also refetches the board (and its activity) each time it joins the room, the first time and
 * after a reconnect, as changes made before that sent it no event. When the caller is removed from
 * the board's workspace, `onRemoved` runs (the page leaves).
 */
export function useBoardSocket(boardId: string, userId: string | undefined, onRemoved: () => void) {
  const queryClient = useQueryClient();
  const removed = useRef(onRemoved);
  useLayoutEffect(() => {
    removed.current = onRemoved;
  });

  useEffect(() => {
    if (!boardId || !userId) return;
    const key = boardKeys.detail(boardId);
    const isNew = createEventDedupe();
    const refetch = () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: activityKeys.board(boardId) });
    };

    // Every join (the first, and each after a reconnect) refetches: changes made before the socket
    // was in the room (while the board loaded, or while disconnected) reach no event.
    let refetchWhenIdle = false;
    const offCache = queryClient.getQueryCache().subscribe(({ query }) => {
      if (!refetchWhenIdle || query.queryHash !== hashKey(key)) return;
      if (query.state.fetchStatus !== 'idle') return;
      refetchWhenIdle = false;
      void queryClient.invalidateQueries({ queryKey: key });
    });
    const leave = joinRoom('board:join', { boardId }, (ack) => {
      if (ack.ok && !ownBoardChangePending(queryClient, boardId)) refetch();
    });
    const unsubscribe = BOARD_EVENTS.map((type) =>
      onEvent(type, (event) => {
        if (event.boardId !== boardId && type !== 'card:moved') return;
        if (!isNew(event.eventId)) return;
        // The activity feed (if open) learns about it too.
        void queryClient.invalidateQueries({ queryKey: activityKeys.board(boardId) });
        if (ownBoardChangePending(queryClient, boardId)) return;
        const board = queryClient.getQueryData<BoardDetailDto>(key);
        if (!board) return;
        // A fetch of the board is under way: its answer may predate this change and would replace
        // the patch, so the board is fetched once more after it (however many events arrive).
        if (queryClient.isFetching({ queryKey: key }) > 0) {
          refetchWhenIdle = true;
          return;
        }
        const next = applyBoardEvent(board, event);
        if (next === 'refetch') void queryClient.invalidateQueries({ queryKey: key });
        else if (next !== board) queryClient.setQueryData(key, next);
      }),
    );
    // The caller was removed from the board's workspace (the server evicts them from its room).
    const offRemoved = onEvent('member:removed', (event) => {
      const board = queryClient.getQueryData<BoardDetailDto>(key);
      if (event.data.userId !== userId || event.workspaceId !== board?.workspaceId) return;
      queryClient.removeQueries({ queryKey: key });
      removed.current();
    });
    return () => {
      offCache();
      leave();
      offRemoved();
      for (const off of unsubscribe) off();
    };
  }, [boardId, userId, queryClient]);
}
