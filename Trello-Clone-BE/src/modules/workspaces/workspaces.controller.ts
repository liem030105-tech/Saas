import * as workspacesService from './workspaces.service';
import { currentUserId } from '../../middlewares/authenticate';
import { validated } from '../../middlewares/validate';

import type { CreateWorkspaceData } from '@trello-clone/shared';
import type { Request, Response } from 'express';

export async function list(req: Request, res: Response) {
  const workspaces = await workspacesService.list(currentUserId(req));
  res.status(200).json({ data: workspaces });
}

export async function create(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, CreateWorkspaceData>(res);
  const workspace = await workspacesService.create(currentUserId(req), body);
  res.status(201).json({ data: workspace });
}
