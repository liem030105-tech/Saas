import { CommentInputSchema, ListCommentsQuerySchema } from '@trello-clone/shared';
import { Router } from 'express';

import * as controller from './comments.controller';
import { authenticate } from '../../middlewares/authenticate';
import { apiRateLimit } from '../../middlewares/rate-limit';
import { validate } from '../../middlewares/validate';

export const commentsRouter = Router();

// authenticate → rate limit → validate; the service authorizes on the card's stored board.
const CARD_COMMENTS = '/cards/:cardId/comments';
commentsRouter.get(
  CARD_COMMENTS,
  authenticate,
  apiRateLimit,
  validate({ query: ListCommentsQuerySchema }),
  controller.list,
);
commentsRouter.post(
  CARD_COMMENTS,
  authenticate,
  apiRateLimit,
  validate({ body: CommentInputSchema }),
  controller.create,
);
const COMMENT = '/comments/:commentId';
commentsRouter.patch(
  COMMENT,
  authenticate,
  apiRateLimit,
  validate({ body: CommentInputSchema }),
  controller.update,
);
commentsRouter.delete(COMMENT, authenticate, apiRateLimit, controller.remove);
