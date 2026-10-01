import {
  CreateBoardInputSchema,
  CreateLabelInputSchema,
  ListBoardsQuerySchema,
  UpdateBoardInputSchema,
  UpdateLabelInputSchema,
} from '@trello-clone/shared';
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

// Board-scoped routes: authenticate → rate limit → validate; the service authorizes with
// assertBoardAccess (an unknown or malformed id is a 404 like a board the caller cannot see).
const BOARD = '/boards/:boardId';
boardsRouter.get(BOARD, authenticate, apiRateLimit, controller.get);
boardsRouter.patch(
  BOARD,
  authenticate,
  apiRateLimit,
  validate({ body: UpdateBoardInputSchema }),
  controller.update,
);
boardsRouter.delete(BOARD, authenticate, apiRateLimit, controller.remove);

// Labels (CARD-005): authorized in the service, like the board-scoped routes above.
boardsRouter.get(`${BOARD}/labels`, authenticate, apiRateLimit, controller.listLabels);
boardsRouter.post(
  `${BOARD}/labels`,
  authenticate,
  apiRateLimit,
  validate({ body: CreateLabelInputSchema }),
  controller.createLabel,
);
const LABEL = '/labels/:labelId';
boardsRouter.patch(
  LABEL,
  authenticate,
  apiRateLimit,
  validate({ body: UpdateLabelInputSchema }),
  controller.updateLabel,
);
boardsRouter.delete(LABEL, authenticate, apiRateLimit, controller.removeLabel);
