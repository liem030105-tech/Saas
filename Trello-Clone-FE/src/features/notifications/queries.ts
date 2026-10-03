import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { workspaceKeys } from '@/features/workspaces';

import { notificationsApi } from './api';

import type { Page } from '@/api/client';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { NotificationDto, UnreadCount } from '@trello-clone/shared';

const READ_ERROR = "Couldn't update the notification. Try again.";
const ACCEPT_ERROR = "Couldn't accept the invite. Check your connection and try again.";

// Query keys: docs/api/notifications.md → Frontend.
export const notificationKeys = {
  all: ['notifications'] as const,
  list: ['notifications', 'list'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
};

/**
 * Due-soon notifications are made when the count is read (no job runner, ADR-021), so the count
 * is also read every 15 minutes while the app is open; focus and reconnect refetch it too.
 */
const UNREAD_REFRESH_MS = 15 * 60 * 1000;

type NotificationPages = InfiniteData<Page<NotificationDto>, string | undefined>;

/** The unread count for the bell. */
export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: notificationsApi.unreadCount,
    refetchInterval: UNREAD_REFRESH_MS,
  });
}

/** The notifications, newest first, one page at a time ("Load more"); fetched while `enabled`. */
export function useNotifications(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list,
    queryFn: ({ pageParam }) => notificationsApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

/** Changes every loaded notification. */
export function updateNotifications(
  queryClient: QueryClient,
  update: (notification: NotificationDto) => NotificationDto,
) {
  queryClient.setQueryData<NotificationPages>(notificationKeys.list, (pages) =>
    pages
      ? { ...pages, pages: pages.pages.map((page) => ({ ...page, data: page.data.map(update) })) }
      : pages,
  );
}

/** A new notification at the top of the first page, unless already there. */
export function prependNotification(queryClient: QueryClient, notification: NotificationDto) {
  queryClient.setQueryData<NotificationPages>(notificationKeys.list, (pages) => {
    if (!pages) return pages;
    if (pages.pages.some((page) => page.data.some((n) => n.id === notification.id))) return pages;
    const [first, ...rest] = pages.pages;
    return first
      ? { ...pages, pages: [{ ...first, data: [notification, ...first.data] }, ...rest] }
      : pages;
  });
}

const refetchCount = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount });

/** Marks one notification read: at once in the list and the count; both put back, with a toast, on error. */
export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => notificationsApi.setRead(notificationId, true),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });
      const previous = {
        list: queryClient.getQueryData<NotificationPages>(notificationKeys.list),
        count: queryClient.getQueryData<UnreadCount>(notificationKeys.unreadCount),
      };
      updateNotifications(queryClient, (n) => (n.id === notificationId ? { ...n, read: true } : n));
      queryClient.setQueryData<UnreadCount>(notificationKeys.unreadCount, (count) =>
        count ? { count: Math.max(0, count.count - 1) } : count,
      );
      return previous;
    },
    onError: (_error, _notificationId, previous) => {
      if (previous?.list) queryClient.setQueryData(notificationKeys.list, previous.list);
      if (previous?.count) queryClient.setQueryData(notificationKeys.unreadCount, previous.count);
      toast.error(READ_ERROR);
    },
    onSettled: () => refetchCount(queryClient),
  });
}

/** "Mark all as read": at once in the list and the count; refetched (with a toast) on error. */
export function useReadAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.readAll,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });
      updateNotifications(queryClient, (n) => ({ ...n, read: true }));
      queryClient.setQueryData<UnreadCount>(notificationKeys.unreadCount, { count: 0 });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.list });
      toast.error(READ_ERROR);
    },
    onSettled: () => refetchCount(queryClient),
  });
}

/** "Accept" on an invite notification: joins the workspace; the caller then opens it. */
export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.acceptInvite,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true });
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError && error.code !== NETWORK_ERROR_CODE
          ? error.message
          : ACCEPT_ERROR,
      );
      // An expired or already used invite: its notification is gone on the server.
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
