import {
  CreateCardInputSchema,
  MoveCardInputSchema,
  UpdateCardInputSchema,
} from '@trello-clone/shared';
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

const CARD = '/cards/:cardId';
cardsRouter.get(CARD, authenticate, apiRateLimit, controller.get);
cardsRouter.patch(
  CARD,
  authenticate,
  apiRateLimit,
  validate({ body: UpdateCardInputSchema }),
  controller.update,
);
cardsRouter.delete(CARD, authenticate, apiRateLimit, controller.remove);
cardsRouter.patch(
  `${CARD}/move`,
  authenticate,
  apiRateLimit,
  validate({ body: MoveCardInputSchema }),
  controller.move,
);
