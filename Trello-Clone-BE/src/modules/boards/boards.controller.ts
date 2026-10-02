import * as boardsService from './boards.service';
import { currentUserId } from '../../middlewares/authenticate';
import { validated } from '../../middlewares/validate';

import type {
  CreateBoardData,
  CreateLabelData,
  ListActivitiesQuery,
  ListBoardsQuery,
  SearchCardsQuery,
  UpdateBoardData,
  UpdateLabelData,
} from '@trello-clone/shared';
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

/** A page of activity: `{ data, nextCursor }` at the top level (docs/api/README.md → Pagination). */
export async function listActivities(req: Request, res: Response) {
  const { query } = validated<unknown, ListActivitiesQuery, unknown>(res);
  const page = await boardsService.listActivities(currentUserId(req), boardIdOf(req), query);
  res.status(200).json(page);
}

export async function search(req: Request, res: Response) {
  const { query } = validated<unknown, SearchCardsQuery, unknown>(res);
  const cards = await boardsService.search(currentUserId(req), boardIdOf(req), query);
  res.status(200).json({ data: cards });
}

export async function listLabels(req: Request, res: Response) {
  const labels = await boardsService.listLabels(currentUserId(req), boardIdOf(req));
  res.status(200).json({ data: labels });
}

export async function createLabel(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, CreateLabelData>(res);
  const label = await boardsService.createLabel(currentUserId(req), boardIdOf(req), body);
  res.status(201).json({ data: label });
}

// /labels/:labelId routes authorize in the service, on the label's stored board.
const labelIdOf = (req: Request) => req.params.labelId as string;

export async function updateLabel(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, UpdateLabelData>(res);
  const label = await boardsService.updateLabel(currentUserId(req), labelIdOf(req), body);
  res.status(200).json({ data: label });
}

export async function removeLabel(req: Request, res: Response) {
  await boardsService.removeLabel(currentUserId(req), labelIdOf(req));
  res.status(204).end();
}
