import { UpdateProfileInputSchema } from '@trello-clone/shared';
import { Router } from 'express';

import * as controller from './users.controller';
import { authenticate } from '../../middlewares/authenticate';
import { apiRateLimit } from '../../middlewares/rate-limit';
import { validate } from '../../middlewares/validate';

export const usersRouter = Router();

// authenticate → rate limit (per user, D-04) → validate → controller.
usersRouter.patch(
  '/users/me',
  authenticate,
  apiRateLimit,
  validate({ body: UpdateProfileInputSchema }),
  controller.updateMe,
);
