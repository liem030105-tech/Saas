import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { createEventDedupe, onEvent, onReconnect } from '@/lib/socket';

import { notificationKeys, prependNotification, updateNotifications } from '../queries';

/**
 * Live notifications (NOTIFICATIONS-001, docs/architecture/realtime.md): the server sends them to
 * the user's own sockets, so there is no room to join.
 * - `notification:created`: goes to the top of the list; the count is fetched again.
 * - `notification:updated` (another tab read one, or all): the list follows; the count too.
 * - After a reconnect both are fetched again, as events may have been missed.
 */
export function useNotificationsSocket(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const isNew = createEventDedupe();
    const refetchCount = () =>
      void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount });
    const offCreated = onEvent('notification:created', (event) => {
      if (!isNew(event.eventId)) return;
      prependNotification(queryClient, event.data);
      refetchCount();
    });
    const offUpdated = onEvent('notification:updated', (event) => {
      if (!isNew(event.eventId)) return;
      const { data } = event;
      updateNotifications(queryClient, (n) =>
        'all' in data
          ? { ...n, read: true }
          : n.id === data.notificationId
            ? { ...n, read: data.read }
            : n,
      );
      refetchCount();
    });
    const offReconnect = onReconnect(
      () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    );
    return () => {
      offCreated();
      offUpdated();
      offReconnect();
    };
  }, [userId, queryClient]);
}
