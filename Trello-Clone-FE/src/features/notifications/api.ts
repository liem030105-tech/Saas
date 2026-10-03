import { apiClient } from '@/api/client';

import type { NotificationDto, UnreadCount, WorkspaceDto } from '@trello-clone/shared';

/** The signed-in user's notifications (docs/api/notifications.md). */
export const notificationsApi = {
  /** GET /notifications: newest first, a page after `cursor`. */
  list: (cursor?: string) =>
    apiClient.getPage<NotificationDto>('/notifications', {
      params: cursor ? { cursor } : undefined,
    }),
  /** GET /notifications/unread-count. */
  unreadCount: () => apiClient.get<UnreadCount>('/notifications/unread-count'),
  /** PATCH /notifications/:notificationId. */
  setRead: (notificationId: string, read: boolean) =>
    apiClient.patch<NotificationDto>(`/notifications/${notificationId}`, { read }),
  /** POST /notifications/read-all. */
  readAll: () => apiClient.post<void>('/notifications/read-all'),
  /** POST /invites/:inviteId/accept: accepting an invite from its notification. */
  acceptInvite: (inviteId: string) => apiClient.post<WorkspaceDto>(`/invites/${inviteId}/accept`),
};
