import * as boardsService from './boards.service';
import { currentUserId } from '../../middlewares/authenticate';
import { validated } from '../../middlewares/validate';

import type { CreateBoardData, ListBoardsQuery, UpdateBoardData } from '@trello-clone/shared';
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

// /boards/:boardId routes authorize in the service (assertBoardAccess): the workspace is only known
// once the stored board is loaded.
const boardIdOf = (req: Request) => req.params.boardId as string;

export async function get(req: Request, res: Response) {
  const board = await boardsService.get(currentUserId(req), boardIdOf(req));
  res.status(200).json({ data: board });
}

export async function update(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, UpdateBoardData>(res);
  const board = await boardsService.update(currentUserId(req), boardIdOf(req), body);
  res.status(200).json({ data: board });
}

export async function remove(req: Request, res: Response) {
  await boardsService.remove(currentUserId(req), boardIdOf(req));
  res.status(204).end();
}
