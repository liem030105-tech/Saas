import * as listsService from './lists.service';
import { currentUserId } from '../../middlewares/authenticate';
import { validated } from '../../middlewares/validate';

import type { CreateListData } from '@trello-clone/shared';
import type { Request, Response } from 'express';

// Board-scoped routes authorize in the service (assertBoardAccess).
const boardIdOf = (req: Request) => req.params.boardId as string;

export async function create(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, CreateListData>(res);
  const list = await listsService.create(currentUserId(req), boardIdOf(req), body);
  res.status(201).json({ data: list });
}
