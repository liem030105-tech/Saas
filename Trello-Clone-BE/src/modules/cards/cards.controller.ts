import * as cardsService from './cards.service';
import { currentUserId } from '../../middlewares/authenticate';
import { validated } from '../../middlewares/validate';

import type { CreateCardData } from '@trello-clone/shared';
import type { Request, Response } from 'express';

// List- and card-scoped routes authorize in the service (assertBoardAccess on the stored board).
const listIdOf = (req: Request) => req.params.listId as string;

export async function create(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, CreateCardData>(res);
  const card = await cardsService.create(currentUserId(req), listIdOf(req), body);
  res.status(201).json({ data: card });
}
