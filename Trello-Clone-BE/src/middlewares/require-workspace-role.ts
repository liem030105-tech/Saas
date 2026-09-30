import { CuidSchema } from '@trello-clone/shared';

import { currentUserId } from './authenticate';
import { AppError } from '../lib/app-error';
import { assertWorkspaceAccess } from '../modules/workspaces/workspaces.service';

import type { WorkspaceAction } from '../modules/workspaces/permissions';
import type { NextFunction, Request, Response } from 'express';

/**
 * For `/workspaces/:workspaceId/*` routes, after `authenticate` and `validate`: the caller must be a
 * member whose role allows `action` (modules/workspaces/permissions.ts). Non-member or unknown workspace → 404, lower role → 403. The role is stored in
 * `res.locals.workspaceRole` for the controller.
 */
export function requireWorkspaceRole(action: WorkspaceAction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const workspaceId = CuidSchema.safeParse(req.params.workspaceId);
    // A malformed id cannot exist: same answer as an unknown workspace.
    if (!workspaceId.success) throw AppError.notFound();
    res.locals.workspaceRole = await assertWorkspaceAccess(
      currentUserId(req),
      workspaceId.data,
      action,
    );
    next();
  };
}
