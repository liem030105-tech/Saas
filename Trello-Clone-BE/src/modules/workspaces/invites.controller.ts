import * as invitesService from './invites.service';
import { currentUserId } from '../../middlewares/authenticate';
import { validated } from '../../middlewares/validate';

import type { Role } from '../../generated/prisma/client';
import type { AcceptInviteInput, CreateInviteData } from '@trello-clone/shared';
import type { Request, Response } from 'express';

// Set by requireWorkspaceRole on /workspaces/:workspaceId routes.
const workspaceIdOf = (req: Request) => req.params.workspaceId as string;
const roleOf = (res: Response) => res.locals.workspaceRole as Role;

export async function list(req: Request, res: Response) {
  const invites = await invitesService.listPending(workspaceIdOf(req));
  res.status(200).json({ data: invites });
}

export async function create(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, CreateInviteData>(res);
  const invite = await invitesService.create(
    workspaceIdOf(req),
    currentUserId(req),
    roleOf(res),
    body,
  );
  res.status(201).json({ data: invite });
}

export async function revoke(req: Request, res: Response) {
  await invitesService.revoke(workspaceIdOf(req), req.params.inviteId as string);
  res.status(204).end();
}

export async function accept(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, AcceptInviteInput>(res);
  const workspace = await invitesService.accept(currentUserId(req), body.token);
  res.status(200).json({ data: workspace });
}
