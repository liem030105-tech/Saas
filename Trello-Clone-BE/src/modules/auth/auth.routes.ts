import { LoginInputSchema, RegisterInputSchema } from '@trello-clone/shared';
import { Router } from 'express';

import * as controller from './auth.controller';
import { authRateLimit } from '../../middlewares/rate-limit';
import { validate } from '../../middlewares/validate';

export const authRouter = Router();

// Public: rate limit (D-04, per IP) → validate → controller.
authRouter.post(
  '/auth/register',
  authRateLimit,
  validate({ body: RegisterInputSchema }),
  controller.register,
);

authRouter.post(
  '/auth/login',
  authRateLimit,
  validate({ body: LoginInputSchema }),
  controller.login,
);
