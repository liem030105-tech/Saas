import { CreateCardInputSchema } from '@trello-clone/shared';
import { Router } from 'express';

import * as controller from './cards.controller';
import { authenticate } from '../../middlewares/authenticate';
import { apiRateLimit } from '../../middlewares/rate-limit';
import { validate } from '../../middlewares/validate';

export const cardsRouter = Router();

// authenticate → rate limit → validate; the service authorizes with assertBoardAccess on the
// list's stored board (an unknown or malformed id is a 404 like a list the caller cannot see).
cardsRouter.post(
  '/lists/:listId/cards',
  authenticate,
  apiRateLimit,
  validate({ body: CreateCardInputSchema }),
  controller.create,
);
