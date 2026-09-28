import { Router } from 'express';
import { z } from 'zod';

import { createApp } from '../../src/app';
import { authRateLimit } from '../../src/middlewares/rate-limit';
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

export const createTestApp = () => createApp({ extraRoutes: testRoutes });
