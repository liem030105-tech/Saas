import { z } from 'zod';

import { UserSummarySchema } from './cards';
import { CuidSchema, PaginationQuerySchema } from './common';
import { InviteRoleSchema, WorkspaceSlugSchema } from './workspaces';
import { NOTIFICATION_TYPES } from '../constants/notifications';

// docs/api/notifications.md (NOTIFICATIONS-001).

export const NotificationTypeSchema = z.enum(NOTIFICATION_TYPES);

/** docs/api/notifications.md → NotificationDto: names and titles as they are now. */
export const NotificationDtoSchema = z.object({
  id: CuidSchema,
  type: NotificationTypeSchema,
  read: z.boolean(),
  createdAt: z.iso.datetime(),
  /** Who caused it; null for CARD_DUE_SOON (and once the actor's account is gone). */
  actor: UserSummarySchema.nullable(),
  workspace: z.object({ id: CuidSchema, name: z.string(), slug: WorkspaceSlugSchema }),
  board: z.object({ id: CuidSchema, title: z.string() }).nullable(),
  card: z
    .object({ id: CuidSchema, title: z.string(), dueDate: z.iso.datetime().nullable() })
    .nullable(),
  comment: z.object({ id: CuidSchema, excerpt: z.string() }).nullable(),
  invite: z.object({ id: CuidSchema, role: InviteRoleSchema }).nullable(),
});

/** GET /notifications query: the pagination convention, plus `unread=true` for unread ones only. */
export const ListNotificationsQuerySchema = PaginationQuerySchema.extend({
  unread: z
    .enum(['true', 'false'], { error: 'Use unread=true or unread=false' })
    .default('false')
    .transform((value) => value === 'true'),
});

export const NotificationsPageSchema = z.object({
  data: z.array(NotificationDtoSchema),
  nextCursor: CuidSchema.nullable(),
});

/** PATCH /notifications/:notificationId body. */
export const UpdateNotificationInputSchema = z.object({ read: z.boolean() });

/** GET /notifications/unread-count answer. */
export const UnreadCountSchema = z.object({ count: z.number().int().min(0) });
