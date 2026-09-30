import {
  ChangeMemberRoleInputSchema,
  CreateWorkspaceInputSchema,
  UpdateWorkspaceInputSchema,
} from '@trello-clone/shared';
import { Router } from 'express';

import * as controller from './workspaces.controller';
import { authenticate } from '../../middlewares/authenticate';
import { apiRateLimit } from '../../middlewares/rate-limit';
import { requireWorkspaceRole } from '../../middlewares/require-workspace-role';
import { validate } from '../../middlewares/validate';

export const workspacesRouter = Router();

// authenticate → rate limit (per user, D-04) → validate → controller. Listing and creating need
// no workspace role; /workspaces/:workspaceId/* routes add requireWorkspaceRole.
workspacesRouter.get('/workspaces', authenticate, apiRateLimit, controller.list);
workspacesRouter.post(
  '/workspaces',
  authenticate,
  apiRateLimit,
  validate({ body: CreateWorkspaceInputSchema }),
  controller.create,
);

// .claude/rules/backend.md: authenticate → rate limit → validate → requireWorkspaceRole.
const WORKSPACE = '/workspaces/:workspaceId';
workspacesRouter.get(
  WORKSPACE,
  authenticate,
  apiRateLimit,
  requireWorkspaceRole('workspace.view'),
  controller.get,
);
workspacesRouter.patch(
  WORKSPACE,
  authenticate,
  apiRateLimit,
  validate({ body: UpdateWorkspaceInputSchema }),
  requireWorkspaceRole('workspace.update'),
  controller.update,
);
workspacesRouter.delete(
  WORKSPACE,
  authenticate,
  apiRateLimit,
  requireWorkspaceRole('workspace.delete'),
  controller.remove,
);

// Members (WORKSPACE-003). The service applies the footnote rules; leaving needs only membership.
const MEMBERS = `${WORKSPACE}/members`;
const MEMBER = `${MEMBERS}/:userId`;
workspacesRouter.get(
  MEMBERS,
  authenticate,
  apiRateLimit,
  requireWorkspaceRole('members.list'),
  controller.listMembers,
);
workspacesRouter.patch(
  MEMBER,
  authenticate,
  apiRateLimit,
  validate({ body: ChangeMemberRoleInputSchema }),
  requireWorkspaceRole('members.changeRole'),
  controller.changeMemberRole,
);
workspacesRouter.delete(
  MEMBER,
  authenticate,
  apiRateLimit,
  // Any member may reach it (leaving); removing someone else needs members.remove (service).
  requireWorkspaceRole('workspace.leave'),
  controller.removeMember,
);
