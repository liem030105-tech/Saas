import { Router } from 'express';
import { z } from 'zod';

import { installMemoryStorage } from './storage';
import { installFakeStripe } from './stripe';
import { createApp } from '../../src/app';
import { authenticate } from '../../src/middlewares/authenticate';
import { authRateLimit } from '../../src/middlewares/rate-limit';
import { requireWorkspaceRole } from '../../src/middlewares/require-workspace-role';
import { validate, validated } from '../../src/middlewares/validate';
import { internalErrorMessage, paths } from '../data/http';

// Test-only routes: exercise validate and errorHandler through the full middleware chain.
const testRoutes = Router();

testRoutes.post(
  paths.validate,
  validate({ body: z.object({ title: z.string().min(1) }) }),
  (_req, res) => {
    res.status(200).json({ data: validated<unknown, unknown, unknown>(res).body });
  },
);

testRoutes.get(paths.throws, async () => {
  await Promise.resolve();
  throw new Error(internalErrorMessage);
});

testRoutes.get(paths.params, (req, res) => {
  res.status(200).json({ data: { id: req.params.id } });
});

testRoutes.get(paths.rateLimited, authRateLimit, (_req, res) => {
  res.status(204).end();
});

testRoutes.get(
  paths.workspaceAdminOnly,
  authenticate,
  requireWorkspaceRole('workspace.update'),
  (_req, res) => {
    res.status(200).json({ data: { role: res.locals.workspaceRole as unknown } });
  },
);

/**
 * The app with the test-only routes; no test reaches S3 or Stripe (a fresh in-memory store and a
 * fresh fake Stripe each time).
 */
export const createTestApp = () => {
  installMemoryStorage();
  installFakeStripe();
  return createApp({ extraRoutes: testRoutes });
};
