import { LoginInputSchema, RegisterInputSchema } from '@trello-clone/shared';
import { Router } from 'express';

import * as controller from './auth.controller';
import { authenticate } from '../../middlewares/authenticate';
import { apiRateLimit, authRateLimit } from '../../middlewares/rate-limit';
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

// Public: authenticated by the refresh cookie only (SameSite=Strict + CORS allowlist, no body).
authRouter.post('/auth/refresh', controller.refresh);

// Bearer: authenticate → rate limit (per user, D-04) → controller.
authRouter.get('/auth/me', authenticate, apiRateLimit, controller.me);

// Public: the refresh cookie only, so it works with an expired access token. Always 204.
authRouter.post('/auth/logout', controller.logout);
