import { CreateWorkspaceInputSchema } from '@trello-clone/shared';
import { Router } from 'express';

import * as controller from './workspaces.controller';
import { authenticate } from '../../middlewares/authenticate';
import { apiRateLimit } from '../../middlewares/rate-limit';
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
