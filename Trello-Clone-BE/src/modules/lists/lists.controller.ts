import * as listsService from './lists.service';
import { currentUserId } from '../../middlewares/authenticate';
import { validated } from '../../middlewares/validate';

import type { CreateListData, UpdateListData } from '@trello-clone/shared';
import type { Request, Response } from 'express';

// Board-scoped routes authorize in the service (assertBoardAccess).
const boardIdOf = (req: Request) => req.params.boardId as string;

export async function create(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, CreateListData>(res);
  const list = await listsService.create(currentUserId(req), boardIdOf(req), body);
  res.status(201).json({ data: list });
}

const listIdOf = (req: Request) => req.params.listId as string;

export async function update(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, UpdateListData>(res);
  const list = await listsService.update(currentUserId(req), listIdOf(req), body);
  res.status(200).json({ data: list });
}

export async function remove(req: Request, res: Response) {
  await listsService.remove(currentUserId(req), listIdOf(req));
  res.status(204).end();
}
