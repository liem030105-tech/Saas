import { Router } from 'express';

import * as controller from './billing.controller';
import { authenticate } from '../../middlewares/authenticate';
import { apiRateLimit } from '../../middlewares/rate-limit';
import { requireWorkspaceRole } from '../../middlewares/require-workspace-role';

export const billingRouter = Router();

// docs/api/billing.md. Checkout, portal and the Stripe webhook come with the Stripe integration.
billingRouter.get(
  '/workspaces/:workspaceId/billing',
  authenticate,
  apiRateLimit,
  requireWorkspaceRole('billing.view'),
  controller.getSummary,
);
