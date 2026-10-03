import { emitEvent, versionOf } from './emit';
import { userRoom } from '../rooms';

import type { NotificationDto, RealtimeEventData } from '@trello-clone/shared';

// Notification events (docs/architecture/realtime.md → Events, NOTIFICATIONS-001): only to the
// recipient's own sockets (their `user:{id}` room), never a workspace or board room.

/** A new notification, sent by the user who caused it. */
export function notificationCreated(recipientId: string, actorId: string, data: NotificationDto) {
  emitEvent([userRoom(recipientId)], {
    type: 'notification:created',
    boardId: data.board?.id ?? null,
    workspaceId: data.workspace.id,
    actorId,
    version: versionOf(),
    data,
  });
}

/**
 * The recipient read (or unread) one notification, or all of them: their other tabs follow. The
 * tab that made the change is left out (emitEvent).
 */
export function notificationUpdated(
  recipientId: string,
  where: { workspaceId: string | null; boardId: string | null },
  data: RealtimeEventData['notification:updated'],
) {
  emitEvent([userRoom(recipientId)], {
    type: 'notification:updated',
    ...where,
    actorId: recipientId,
    version: versionOf(),
    data,
  });
}
