import * as boardsService from './boards.service';
import { currentUserId } from '../../middlewares/authenticate';
import { validated } from '../../middlewares/validate';

import type { CreateBoardData, ListBoardsQuery } from '@trello-clone/shared';
import type { Request, Response } from 'express';

// /workspaces/:workspaceId routes run after requireWorkspaceRole.
const workspaceIdOf = (req: Request) => req.params.workspaceId as string;

export async function list(req: Request, res: Response) {
  const { query } = validated<unknown, ListBoardsQuery, unknown>(res);
  const boards = await boardsService.list(workspaceIdOf(req), query);
  res.status(200).json({ data: boards });
}

export async function create(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, CreateBoardData>(res);
  const board = await boardsService.create(currentUserId(req), workspaceIdOf(req), body);
  res.status(201).json({ data: board });
}
