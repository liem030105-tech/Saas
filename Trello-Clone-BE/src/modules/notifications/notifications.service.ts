import { NOTIFICATION_INCLUDE, toNotificationDto } from './notifications.mapper';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';

import type { Prisma } from '../../generated/prisma/client';
import type {
  ListNotificationsQuery,
  NotificationDto,
  NotificationsPage,
} from '@trello-clone/shared';

// docs/api/notifications.md (NOTIFICATIONS-001). Every route is the caller's own notifications;
// someone else's id, an unknown one and one the caller may no longer see are the same 404.

/** Newest first; `id` breaks ties between notifications made in the same millisecond. */
const NEWEST_FIRST = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.NotificationOrderByWithRelationInput[];

/**
 * The caller's notifications they may see now (docs/api/notifications.md → Who sees a notification),
 * re-checked on every read. Card types need `board.view` on their board; board access is workspace
 * membership today (assertBoardAccess), so it is one membership condition. An invite is shown while
 * it is pending and addressed to the caller's email.
 */
async function visibleTo(userId: string): Promise<Prisma.NotificationWhereInput> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return {
    userId,
    OR: [
      { type: { not: 'WORKSPACE_INVITED' }, workspace: { members: { some: { userId } } } },
      {
        type: 'WORKSPACE_INVITED',
        invite: { acceptedAt: null, expiresAt: { gt: new Date() }, email: user?.email ?? '' },
      },
    ],
  };
}

const unknownCursor = () =>
  new AppError('VALIDATION_ERROR', 400, 'Request validation failed', [
    { path: 'cursor', message: 'Unknown cursor' },
  ]);

/** GET /notifications: a page, newest first, and the next page's cursor. */
export async function list(
  userId: string,
  query: ListNotificationsQuery,
): Promise<NotificationsPage> {
  const visible = await visibleTo(userId);
  const where: Prisma.NotificationWhereInput = {
    AND: [visible, query.unread ? { readAt: null } : {}],
  };
  let after: Prisma.NotificationWhereInput = {};
  if (query.cursor) {
    // The cursor must be one of the caller's visible notifications, else it is a bad request.
    const from = await prisma.notification.findFirst({
      where: { AND: [visible, { id: query.cursor }] },
    });
    if (!from) throw unknownCursor();
    after = {
      OR: [
        { createdAt: { lt: from.createdAt } },
        { createdAt: from.createdAt, id: { lt: from.id } },
      ],
    };
  }
  const rows = await prisma.notification.findMany({
    where: { AND: [where, after] },
    orderBy: NEWEST_FIRST,
    include: NOTIFICATION_INCLUDE,
    take: query.limit + 1,
  });
  const page = rows.slice(0, query.limit);
  return {
    data: page.map(toNotificationDto),
    nextCursor: rows.length > query.limit ? page.at(-1)!.id : null,
  };
}

/** GET /notifications/unread-count: the caller's visible unread notifications. */
export async function unreadCount(userId: string): Promise<{ count: number }> {
  const count = await prisma.notification.count({
    where: { AND: [await visibleTo(userId), { readAt: null }] },
  });
  return { count };
}

/** PATCH /notifications/:notificationId: read or unread; idempotent. */
export async function setRead(
  userId: string,
  notificationId: string,
  read: boolean,
): Promise<NotificationDto> {
  const where = { AND: [await visibleTo(userId), { id: notificationId }] };
  const current = await prisma.notification.findFirst({ where, select: { readAt: true } });
  if (!current) throw AppError.notFound();
  // Keeps the first read time when it is already read.
  const readAt = read ? (current.readAt ?? new Date()) : null;
  const { count } = await prisma.notification.updateMany({ where, data: { readAt } });
  if (count === 0) throw AppError.notFound(); // deleted meanwhile with what it pointed to
  const row = await prisma.notification.findFirst({ where, include: NOTIFICATION_INCLUDE });
  if (!row) throw AppError.notFound();
  return toNotificationDto(row);
}

/** POST /notifications/read-all: every notification of the caller created up to now is read. */
export async function readAll(userId: string): Promise<void> {
  const now = new Date();
  await prisma.notification.updateMany({
    where: { userId, readAt: null, createdAt: { lte: now } },
    data: { readAt: now },
  });
}

/**
 * Marks the caller's notification of an invite read, inside the transaction that accepts it
 * (POST /invites/:inviteId/accept, workspaces module).
 */
export async function markInviteRead(
  tx: Prisma.TransactionClient,
  userId: string,
  inviteId: string,
): Promise<void> {
  await tx.notification.updateMany({
    where: { userId, inviteId, readAt: null },
    data: { readAt: new Date() },
  });
}
