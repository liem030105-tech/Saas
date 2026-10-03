import type {
  ListNotificationsQuerySchema,
  NotificationDtoSchema,
  NotificationsPageSchema,
  UnreadCountSchema,
  UpdateNotificationInputSchema,
} from '../schemas/notifications';
import type { z } from 'zod';

export type NotificationDto = z.infer<typeof NotificationDtoSchema>;
export type ListNotificationsQueryInput = z.input<typeof ListNotificationsQuerySchema>;
export type ListNotificationsQuery = z.output<typeof ListNotificationsQuerySchema>;
export type NotificationsPage = z.infer<typeof NotificationsPageSchema>;
export type UpdateNotificationInput = z.infer<typeof UpdateNotificationInputSchema>;
export type UnreadCount = z.infer<typeof UnreadCountSchema>;
