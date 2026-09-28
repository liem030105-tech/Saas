import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

import { AppError } from '../lib/app-error';

import type { NextFunction, Request, Response } from 'express';

// Proposed defaults from D-04. Applied to routes by AUTH-001/AUTH-002 and the authenticated API.
export const RATE_LIMITS = {
  auth: { windowMs: 60_000, limit: 10 }, // per IP: /auth/register, /auth/login
  api: { windowMs: 60_000, limit: 300 }, // per user once authenticated, else per IP
} as const;

const clientIp = (req: Request) => ipKeyGenerator(req.ip ?? 'unknown');

const common = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Retry-After is already set; the canonical 429 body comes from errorHandler.
  handler: (_req: Request, _res: Response, next: NextFunction) => {
    next(new AppError('RATE_LIMITED', 429, 'Too many requests, try again later'));
  },
} as const;

export const authRateLimit = rateLimit({
  ...common,
  ...RATE_LIMITS.auth,
  keyGenerator: clientIp,
});

export const apiRateLimit = rateLimit({
  ...common,
  ...RATE_LIMITS.api,
  keyGenerator: (req, res) => {
    const userId: unknown = res.locals.userId; // set by `authenticate` (AUTH-005)
    return typeof userId === 'string' ? `user:${userId}` : clientIp(req);
  },
});
