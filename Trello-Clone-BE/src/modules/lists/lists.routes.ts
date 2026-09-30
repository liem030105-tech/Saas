import { CreateListInputSchema, UpdateListInputSchema } from '@trello-clone/shared';
import { Router } from 'express';

import * as controller from './lists.controller';
import { authenticate } from '../../middlewares/authenticate';
import { apiRateLimit } from '../../middlewares/rate-limit';
import { validate } from '../../middlewares/validate';

export const listsRouter = Router();

// authenticate → rate limit → validate; the service authorizes with assertBoardAccess on the stored
// board (an unknown or malformed id is a 404 like a board or list the caller cannot see).
listsRouter.post(
  '/boards/:boardId/lists',
  authenticate,
  apiRateLimit,
  validate({ body: CreateListInputSchema }),
  controller.create,
);

const LIST = '/lists/:listId';
listsRouter.patch(
  LIST,
  authenticate,
  apiRateLimit,
  validate({ body: UpdateListInputSchema }),
  controller.update,
);
listsRouter.delete(LIST, authenticate, apiRateLimit, controller.remove);
