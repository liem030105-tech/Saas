import * as billingService from './billing.service';
import { verifyWebhookEvent } from '../../lib/stripe';

import type { Request, Response } from 'express';

// docs/api/billing.md: requireWorkspaceRole has checked the caller's role on the workspace routes.
const workspaceIdOf = (req: Request) => req.params.workspaceId as string;

export async function getSummary(req: Request, res: Response) {
  res.status(200).json({ data: await billingService.getSummary(workspaceIdOf(req)) });
}

export async function checkout(req: Request, res: Response) {
  res.status(200).json({ data: await billingService.checkout(workspaceIdOf(req)) });
}

export async function portal(req: Request, res: Response) {
  res.status(200).json({ data: await billingService.portal(workspaceIdOf(req)) });
}

/**
 * POST /billing/webhook: `req.body` is the raw body (express.raw in app.ts). Stripe is the only
 * caller, so a bad signature gets a plain 400, not the JSON error format; a failure after the check
 * is a 500 and Stripe retries.
 */
export async function webhook(req: Request, res: Response) {
  const event = Buffer.isBuffer(req.body)
    ? verifyWebhookEvent(req.body, req.get('stripe-signature'))
    : null;
  if (!event) {
    res.status(400).type('text/plain').send('Invalid signature');
    return;
  }
  await billingService.handleWebhookEvent(event);
  res.status(200).json({});
}
