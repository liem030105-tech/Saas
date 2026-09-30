import { CreateListInputSchema } from '@trello-clone/shared';
import { Router } from 'express';

import * as controller from './lists.controller';
import { authenticate } from '../../middlewares/authenticate';
import { apiRateLimit } from '../../middlewares/rate-limit';
import { validate } from '../../middlewares/validate';

export const listsRouter = Router();

// authenticate → rate limit → validate; the service authorizes with assertBoardAccess (an unknown
// or malformed board id is a 404 like a board the caller cannot see).
listsRouter.post(
  '/boards/:boardId/lists',
  authenticate,
  apiRateLimit,
  validate({ body: CreateListInputSchema }),
  controller.create,
);
