import { Router } from 'express';
import { z } from 'zod';

import { createApp } from '../../src/app';
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

export const createTestApp = () => createApp({ extraRoutes: testRoutes });
