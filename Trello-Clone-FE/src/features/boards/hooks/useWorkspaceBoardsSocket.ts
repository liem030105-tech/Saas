import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { createEventDedupe, joinRoom, onEvent } from '@/lib/socket';

import { boardKeys } from '../queries';

import type { RealtimeEventType } from '@trello-clone/shared';

const WORKSPACE_BOARD_EVENTS = [
  'board:created',
  'board:updated',
  'board:deleted',
] as const satisfies readonly RealtimeEventType[];

/**
 * While a workspace's boards are shown (REALTIME-001): a board created, renamed, archived or
 * deleted elsewhere refetches the workspace's board lists, and so does every join of
 * `workspace:{id}` (the first, and after a reconnect), for changes made before it.
 */
export function useWorkspaceBoardsSocket(workspaceId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const refetch = () =>
      void queryClient.invalidateQueries({ queryKey: boardKeys.workspace(workspaceId) });
    const isNew = createEventDedupe();
    const leave = joinRoom('workspace:join', { workspaceId }, (ack) => {
      if (ack.ok) refetch();
    });
    const offs = WORKSPACE_BOARD_EVENTS.map((type) =>
      onEvent(type, (event) => {
        if (event.workspaceId === workspaceId && isNew(event.eventId)) refetch();
      }),
    );
    return () => {
      leave();
      for (const off of offs) off();
    };
  }, [workspaceId, queryClient]);
}
