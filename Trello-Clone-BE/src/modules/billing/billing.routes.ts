import express, { Router } from 'express';

import * as controller from './billing.controller';
import { authenticate } from '../../middlewares/authenticate';
import { apiRateLimit } from '../../middlewares/rate-limit';
import { requireWorkspaceRole } from '../../middlewares/require-workspace-role';

export const billingRouter = Router();

// docs/api/billing.md.
const BILLING = '/workspaces/:workspaceId/billing';
billingRouter.get(
  BILLING,
  authenticate,
  apiRateLimit,
  requireWorkspaceRole('billing.view'),
  controller.getSummary,
);
billingRouter.post(
  `${BILLING}/checkout`,
  authenticate,
  apiRateLimit,
  requireWorkspaceRole('billing.manage'),
  controller.checkout,
);
billingRouter.post(
  `${BILLING}/portal`,
  authenticate,
  apiRateLimit,
  requireWorkspaceRole('billing.manage'),
  controller.portal,
);

/**
 * The Stripe webhook, mounted in app.ts before the JSON parser: the signature is checked on the
 * raw bytes. Public; only a valid signature gets past the controller's first line.
 */
export const billingWebhookRouter = Router();
billingWebhookRouter.post(
  '/billing/webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  controller.webhook,
);
