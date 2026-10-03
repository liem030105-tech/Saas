import * as notificationsService from './notifications.service';
import { currentUserId } from '../../middlewares/authenticate';
import { validated } from '../../middlewares/validate';

import type { ListNotificationsQuery, UpdateNotificationInput } from '@trello-clone/shared';
import type { Request, Response } from 'express';

// The caller's own notifications only; the service scopes every query to them.
const notificationIdOf = (req: Request) => req.params.notificationId as string;

export async function list(req: Request, res: Response) {
  const { query } = validated<unknown, ListNotificationsQuery, unknown>(res);
  res.status(200).json(await notificationsService.list(currentUserId(req), query));
}

export async function unreadCount(req: Request, res: Response) {
  res.status(200).json({ data: await notificationsService.unreadCount(currentUserId(req)) });
}

export async function update(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, UpdateNotificationInput>(res);
  const notification = await notificationsService.setRead(
    currentUserId(req),
    notificationIdOf(req),
    body.read,
  );
  res.status(200).json({ data: notification });
}

export async function readAll(req: Request, res: Response) {
  await notificationsService.readAll(currentUserId(req));
  res.status(204).end();
}
