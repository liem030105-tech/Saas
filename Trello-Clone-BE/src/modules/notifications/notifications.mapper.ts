import { NOTIFICATION_EXCERPT_LENGTH } from '@trello-clone/shared';

import type { Prisma } from '../../generated/prisma/client';
import type { NotificationDto } from '@trello-clone/shared';

type InviteRole = NonNullable<NotificationDto['invite']>['role'];

/** What a NotificationDto is read with: the current names and titles of what it points to. */
export const NOTIFICATION_INCLUDE = {
  actor: { select: { id: true, name: true, avatarUrl: true } },
  workspace: { select: { id: true, name: true, slug: true } },
  board: { select: { id: true, title: true } },
  card: { select: { id: true, title: true, dueDate: true } },
  comment: { select: { id: true, content: true } },
  invite: { select: { id: true, role: true } },
} satisfies Prisma.NotificationInclude;

export type NotificationRow = Prisma.NotificationGetPayload<{
  include: typeof NOTIFICATION_INCLUDE;
}>;

/** docs/api/notifications.md → NotificationDto. */
export function toNotificationDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
    actor: row.actor,
    workspace: row.workspace,
    board: row.board,
    card: row.card && { ...row.card, dueDate: row.card.dueDate?.toISOString() ?? null },
    comment: row.comment && {
      id: row.comment.id,
      excerpt: row.comment.content.slice(0, NOTIFICATION_EXCERPT_LENGTH),
    },
    // Invites never grant OWNER (I5), so the stored role is always an invite role.
    invite: row.invite && { id: row.invite.id, role: row.invite.role as InviteRole },
  };
}
