import { NOTIFICATION_INCLUDE, toNotificationDto } from './notifications.mapper';
import { logger } from '../../config/logger';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import {
  notificationCreated,
  notificationUpdated,
} from '../../realtime/events/notifications.events';

import type { NotificationType, Prisma } from '../../generated/prisma/client';
import type {
  ListNotificationsQuery,
  NotificationDto,
  NotificationsPage,
} from '@trello-clone/shared';

// docs/api/notifications.md (NOTIFICATIONS-001). Every route is the caller's own notifications;
// someone else's id, an unknown one and one the caller may no longer see are the same 404.

/** A card's members get CARD_DUE_SOON once it is due within this long (D-29: 24 hours). */
export const DUE_SOON_MS = 24 * 60 * 60 * 1000;

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
  await createDueSoon(userId);
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
  await createDueSoon(userId);
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
  notificationUpdated(
    userId,
    { workspaceId: row.workspaceId, boardId: row.boardId },
    { notificationId, read },
  );
  return toNotificationDto(row);
}

/**
 * POST /notifications/read-all: every notification the caller sees now, created up to now, is read.
 * Hidden ones (a workspace they left, an expired invite) stay as they are, so rejoining shows them
 * as they were.
 */
export async function readAll(userId: string): Promise<void> {
  const now = new Date();
  await prisma.notification.updateMany({
    where: { AND: [await visibleTo(userId), { readAt: null, createdAt: { lte: now } }] },
    data: { readAt: now },
  });
  notificationUpdated(userId, { workspaceId: null, boardId: null }, { all: true });
}

/**
 * Marks the caller's notification of an invite read, inside the transaction that accepts it
 * (POST /invites/:inviteId/accept, workspaces module). Returns their ids for `announceRead`.
 */
export async function markInviteRead(
  tx: Prisma.TransactionClient,
  userId: string,
  inviteId: string,
): Promise<string[]> {
  const unread = await tx.notification.findMany({
    where: { userId, inviteId, readAt: null },
    select: { id: true },
  });
  const ids = unread.map((row) => row.id);
  await tx.notification.updateMany({ where: { id: { in: ids } }, data: { readAt: new Date() } });
  return ids;
}

/** After the commit of `markInviteRead`: the recipient's other tabs hear the notifications read. */
export function announceRead(userId: string, workspaceId: string, notificationIds: string[]) {
  for (const notificationId of notificationIds) {
    notificationUpdated(userId, { workspaceId, boardId: null }, { notificationId, read: true });
  }
}

/** One notification to write (docs/api/notifications.md → Triggers); `userId` is the recipient. */
export interface NotificationInput {
  userId: string;
  type: NotificationType;
  workspaceId: string;
  actorId: string;
  boardId?: string;
  cardId?: string;
  commentId?: string;
  inviteId?: string;
}

/** A notification written by `notify`, for `announce` once the transaction commits. */
export interface CreatedNotification {
  id: string;
  userId: string;
}

/**
 * Writes notifications inside the transaction of the change that causes them. Nobody is notified
 * about their own action, so a recipient who is the actor is dropped. Returns what `announce`
 * needs after the commit.
 */
export async function notify(
  tx: Prisma.TransactionClient,
  inputs: NotificationInput[],
): Promise<CreatedNotification[]> {
  const wanted = inputs.filter((input) => input.userId !== input.actorId);
  if (wanted.length === 0) return [];
  return tx.notification.createManyAndReturn({
    data: wanted,
    select: { id: true, userId: true },
  });
}

/**
 * After the commit: sends each new notification to its recipient's sockets, from the user who
 * caused it. A failure only loses the live update (logged); the notification is stored and shows
 * on the next read.
 */
export async function announce(actorId: string, created: CreatedNotification[]): Promise<void> {
  if (created.length === 0) return;
  try {
    const rows = await prisma.notification.findMany({
      where: { id: { in: created.map((n) => n.id) } },
      include: NOTIFICATION_INCLUDE,
    });
    for (const row of rows) notificationCreated(row.userId, actorId, toNotificationDto(row));
  } catch (error) {
    logger.error({ err: error }, 'notification:created not sent');
  }
}

/**
 * Due-soon notifications have no job runner (ADR-021): the recipient's own read creates the
 * missing ones first, for their open cards due within DUE_SOON_MS in workspaces they still belong
 * to. At most one per card and due date (the `(userId, dedupeKey)` unique; a changed due date
 * notifies again); concurrent reads skip what another already wrote. Not sent live.
 */
async function createDueSoon(userId: string): Promise<void> {
  const now = new Date();
  const cards = await prisma.card.findMany({
    where: {
      members: { some: { userId } },
      completed: false,
      archived: false,
      dueDate: { gt: now, lte: new Date(now.getTime() + DUE_SOON_MS) },
      board: { workspace: { members: { some: { userId } } } },
    },
    select: { id: true, boardId: true, dueDate: true, board: { select: { workspaceId: true } } },
  });
  if (cards.length === 0) return;
  await prisma.notification.createMany({
    data: cards.map((card) => ({
      userId,
      type: 'CARD_DUE_SOON' as const,
      workspaceId: card.board.workspaceId,
      boardId: card.boardId,
      cardId: card.id,
      dedupeKey: `due:${card.id}:${card.dueDate!.toISOString()}`,
    })),
    skipDuplicates: true,
  });
}

/**
 * Points a card's notifications at its new board, inside the transaction that moves the card to
 * another board of its workspace (PATCH /cards/:cardId/move), so their board stays the card's.
 */
export async function moveCard(
  tx: Prisma.TransactionClient,
  cardId: string,
  boardId: string,
): Promise<void> {
  await tx.notification.updateMany({
    where: { cardId, boardId: { not: boardId } },
    data: { boardId },
  });
}
