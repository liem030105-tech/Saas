import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useCurrentUser } from '@/features/auth';
import { createEventDedupe, joinRoom, onEvent, onReconnect } from '@/lib/socket';

import { useWorkspaces, workspaceKeys } from '../queries';

import type { QueryClient } from '@tanstack/react-query';
import type { WorkspaceDto } from '@trello-clone/shared';

/**
 * The caller is no longer in the workspace: it leaves the cached list at once (its pages redirect
 * to `/`, WorkspaceGate) with its members and invites, and the list is fetched again.
 */
function forgetWorkspace(queryClient: QueryClient, workspaceId: string) {
  queryClient.removeQueries({ queryKey: workspaceKeys.members(workspaceId) });
  queryClient.removeQueries({ queryKey: workspaceKeys.invites(workspaceId) });
  queryClient.setQueryData<WorkspaceDto[]>(workspaceKeys.all, (list) =>
    list?.filter((workspace) => workspace.id !== workspaceId),
  );
  void queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true });
}

/**
 * The sidebar's realtime part (REALTIME-001, docs/architecture/realtime.md → FE synchronization
 * rules): joins `workspace:{id}` for each of the caller's workspaces.
 * - `member:removed` for the caller (removed by an admin, or left in another tab): the workspace
 *   is forgotten, so its pages go to `/`; for someone else: its member list is refetched.
 * - A refused join (removed, or the workspace deleted, while disconnected) refetches the list,
 *   which drops it.
 * - After a reconnect everything workspace-level is refetched, as events may have been missed.
 * This tab's own leave sends it nothing (X-Socket-Id); useLeaveWorkspace already forgets it.
 */
export function useWorkspacesSocket() {
  const queryClient = useQueryClient();
  const userId = useCurrentUser().data?.id;
  const ids = (useWorkspaces().data ?? []).map((workspace) => workspace.id);
  const joined = ids.sort().join(',');
  /** The rooms held, by workspace id, with their leave functions. */
  const rooms = useRef(new Map<string, () => void>());

  // Joins and leaves only the workspaces that came or went: leaving and joining again would drop
  // the room's events in between.
  useEffect(() => {
    if (!userId) return;
    const held = rooms.current;
    const wanted = new Set(joined ? joined.split(',') : []);
    for (const [workspaceId, leave] of held) {
      if (wanted.has(workspaceId)) continue;
      leave();
      held.delete(workspaceId);
    }
    for (const workspaceId of wanted) {
      if (held.has(workspaceId)) continue;
      const leave = joinRoom('workspace:join', { workspaceId }, (ack) => {
        if (!ack.ok) {
          void queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true });
        }
      });
      held.set(workspaceId, leave);
    }
  }, [joined, userId, queryClient]);

  // All of them on unmount, or for another user.
  useEffect(() => {
    const held = rooms.current;
    return () => {
      for (const leave of held.values()) leave();
      held.clear();
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const isNew = createEventDedupe();
    const off = onEvent('member:removed', (event) => {
      if (!isNew(event.eventId)) return;
      if (event.data.userId === userId) forgetWorkspace(queryClient, event.workspaceId);
      else {
        void queryClient.invalidateQueries({ queryKey: workspaceKeys.members(event.workspaceId) });
      }
    });
    const offReconnect = onReconnect(
      () => void queryClient.invalidateQueries({ queryKey: workspaceKeys.all }),
    );
    return () => {
      off();
      offReconnect();
    };
  }, [userId, queryClient]);
}
