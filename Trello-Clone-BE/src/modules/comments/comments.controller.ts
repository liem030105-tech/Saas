import * as commentsService from './comments.service';
import { currentUserId } from '../../middlewares/authenticate';
import { validated } from '../../middlewares/validate';

import type { CommentData, ListCommentsQuery } from '@trello-clone/shared';
import type { Request, Response } from 'express';

// Comment routes authorize in the service, on the card's stored board.
const cardIdOf = (req: Request) => req.params.cardId as string;
const commentIdOf = (req: Request) => req.params.commentId as string;

export async function list(req: Request, res: Response) {
  const { query } = validated<unknown, ListCommentsQuery, unknown>(res);
  const page = await commentsService.list(currentUserId(req), cardIdOf(req), query);
  res.status(200).json(page);
}

export async function create(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, CommentData>(res);
  const comment = await commentsService.create(currentUserId(req), cardIdOf(req), body);
  res.status(201).json({ data: comment });
}

export async function update(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, CommentData>(res);
  const comment = await commentsService.update(currentUserId(req), commentIdOf(req), body);
  res.status(200).json({ data: comment });
}

export async function remove(req: Request, res: Response) {
  await commentsService.remove(currentUserId(req), commentIdOf(req));
  res.status(204).end();
}
