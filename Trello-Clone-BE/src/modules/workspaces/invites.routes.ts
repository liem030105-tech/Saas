import { AcceptInviteInputSchema, CreateInviteInputSchema } from '@trello-clone/shared';
import { Router } from 'express';

import * as controller from './invites.controller';
import { authenticate } from '../../middlewares/authenticate';
import { apiRateLimit } from '../../middlewares/rate-limit';
import { requireWorkspaceRole } from '../../middlewares/require-workspace-role';
import { validate } from '../../middlewares/validate';

export const invitesRouter = Router();

// .claude/rules/backend.md: authenticate → rate limit → validate → requireWorkspaceRole.
const INVITES = '/workspaces/:workspaceId/invites';
invitesRouter.get(
  INVITES,
  authenticate,
  apiRateLimit,
  requireWorkspaceRole('ADMIN'),
  controller.list,
);
invitesRouter.post(
  INVITES,
  authenticate,
  apiRateLimit,
  validate({ body: CreateInviteInputSchema }),
  requireWorkspaceRole('ADMIN'),
  controller.create,
);
invitesRouter.delete(
  `${INVITES}/:inviteId`,
  authenticate,
  apiRateLimit,
  requireWorkspaceRole('ADMIN'),
  controller.revoke,
);

// No workspace role: the invited user is not a member yet; the service checks the token and email.
invitesRouter.post(
  '/invites/accept',
  authenticate,
  apiRateLimit,
  validate({ body: AcceptInviteInputSchema }),
  controller.accept,
);
