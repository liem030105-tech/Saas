import * as cardsService from './cards.service';
import { currentUserId } from '../../middlewares/authenticate';
import { validated } from '../../middlewares/validate';

import type { CreateCardData, UpdateCardData } from '@trello-clone/shared';
import type { Request, Response } from 'express';

// List- and card-scoped routes authorize in the service (assertBoardAccess on the stored board).
const listIdOf = (req: Request) => req.params.listId as string;

export async function create(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, CreateCardData>(res);
  const card = await cardsService.create(currentUserId(req), listIdOf(req), body);
  res.status(201).json({ data: card });
}

const cardIdOf = (req: Request) => req.params.cardId as string;

export async function get(req: Request, res: Response) {
  const card = await cardsService.get(currentUserId(req), cardIdOf(req));
  res.status(200).json({ data: card });
}

export async function update(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, UpdateCardData>(res);
  const card = await cardsService.update(currentUserId(req), cardIdOf(req), body);
  res.status(200).json({ data: card });
}

export async function remove(req: Request, res: Response) {
  await cardsService.remove(currentUserId(req), cardIdOf(req));
  res.status(204).end();
}
