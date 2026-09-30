import { CreateBoardInputSchema, ListBoardsQuerySchema } from '@trello-clone/shared';
import { Router } from 'express';

import * as controller from './boards.controller';
import { authenticate } from '../../middlewares/authenticate';
import { apiRateLimit } from '../../middlewares/rate-limit';
import { requireWorkspaceRole } from '../../middlewares/require-workspace-role';
import { validate } from '../../middlewares/validate';

export const boardsRouter = Router();

// .claude/rules/backend.md: authenticate → rate limit → validate → requireWorkspaceRole.
const BOARDS = '/workspaces/:workspaceId/boards';
boardsRouter.get(
  BOARDS,
  authenticate,
  apiRateLimit,
  validate({ query: ListBoardsQuerySchema }),
  requireWorkspaceRole('board.view'),
  controller.list,
);
boardsRouter.post(
  BOARDS,
  authenticate,
  apiRateLimit,
  validate({ body: CreateBoardInputSchema }),
  requireWorkspaceRole('board.edit'),
  controller.create,
);
