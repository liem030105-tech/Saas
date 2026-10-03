import { ListNotificationsQuerySchema, UpdateNotificationInputSchema } from '@trello-clone/shared';
import { Router } from 'express';

import * as controller from './notifications.controller';
import { authenticate } from '../../middlewares/authenticate';
import { apiRateLimit } from '../../middlewares/rate-limit';
import { validate } from '../../middlewares/validate';

export const notificationsRouter = Router();

// authenticate → rate limit → validate; no workspace role: every route is the caller's own data.
notificationsRouter.get(
  '/notifications',
  authenticate,
  apiRateLimit,
  validate({ query: ListNotificationsQuerySchema }),
  controller.list,
);
notificationsRouter.get(
  '/notifications/unread-count',
  authenticate,
  apiRateLimit,
  controller.unreadCount,
);
notificationsRouter.post('/notifications/read-all', authenticate, apiRateLimit, controller.readAll);
notificationsRouter.patch(
  '/notifications/:notificationId',
  authenticate,
  apiRateLimit,
  validate({ body: UpdateNotificationInputSchema }),
  controller.update,
);
