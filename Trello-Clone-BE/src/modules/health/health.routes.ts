import { Router } from 'express';

import * as controller from './health.controller';

export const healthRouter = Router();

// Public: load balancers and smoke tests call it without a token.
healthRouter.get('/health', controller.getHealth);
