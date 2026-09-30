import * as workspacesService from './workspaces.service';
import { currentUserId } from '../../middlewares/authenticate';
import { validated } from '../../middlewares/validate';

import type { Role } from '../../generated/prisma/client';
import type {
  ChangeMemberRoleInput,
  CreateWorkspaceData,
  UpdateWorkspaceData,
} from '@trello-clone/shared';
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

// Set by requireWorkspaceRole on /workspaces/:workspaceId routes.
const workspaceIdOf = (req: Request) => req.params.workspaceId as string;
const roleOf = (res: Response) => res.locals.workspaceRole as Role;

export async function get(req: Request, res: Response) {
  const workspace = await workspacesService.get(workspaceIdOf(req), roleOf(res));
  res.status(200).json({ data: workspace });
}

export async function update(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, UpdateWorkspaceData>(res);
  const workspace = await workspacesService.update(workspaceIdOf(req), roleOf(res), body);
  res.status(200).json({ data: workspace });
}

export async function remove(req: Request, res: Response) {
  await workspacesService.remove(workspaceIdOf(req));
  res.status(204).end();
}

const targetUserIdOf = (req: Request) => req.params.userId as string;

export async function listMembers(req: Request, res: Response) {
  const members = await workspacesService.listMembers(workspaceIdOf(req));
  res.status(200).json({ data: members });
}

export async function changeMemberRole(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, ChangeMemberRoleInput>(res);
  const member = await workspacesService.changeMemberRole(
    workspaceIdOf(req),
    currentUserId(req),
    targetUserIdOf(req),
    body.role,
  );
  res.status(200).json({ data: member });
}

export async function removeMember(req: Request, res: Response) {
  await workspacesService.removeMember(workspaceIdOf(req), currentUserId(req), targetUserIdOf(req));
  res.status(204).end();
}
