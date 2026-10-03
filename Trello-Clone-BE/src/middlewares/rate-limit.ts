import { ipKeyGenerator, MemoryStore, rateLimit } from 'express-rate-limit';

import { AppError } from '../lib/app-error';

import type { NextFunction, Request, Response } from 'express';

// Proposed defaults from D-04. Applied to routes by AUTH-001/AUTH-002 and the authenticated API.
export const RATE_LIMITS = {
  auth: { windowMs: 60_000, limit: 10 }, // per IP: /auth/register, /auth/login
  api: { windowMs: 60_000, limit: 300 }, // per user once authenticated, else per IP
} as const;

// req.ip is the client's address: app.ts sets `trust proxy` to TRUST_PROXY (1 behind Render's proxy,
// DEPLOYMENT-001), so every user behind the proxy is not one key.
const clientIp = (req: Request) => ipKeyGenerator(req.ip ?? 'unknown');

const common = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Retry-After is already set; the canonical 429 body comes from errorHandler.
  handler: (_req: Request, _res: Response, next: NextFunction) => {
    next(new AppError('RATE_LIMITED', 429, 'Too many requests, try again later'));
  },
} as const;

// Counters live in process memory (no Redis without an ADR); a restart resets them.
const authStore = new MemoryStore();

export const authRateLimit = rateLimit({
  ...common,
  ...RATE_LIMITS.auth,
  keyGenerator: clientIp,
  store: authStore,
});

/** Clears the auth counters, so each test starts with a fresh budget. */
export const resetAuthRateLimit = () => authStore.resetAll();

export const apiRateLimit = rateLimit({
  ...common,
  ...RATE_LIMITS.api,
  // Must run after `authenticate`, which sets req.userId.
  keyGenerator: (req) => (req.userId ? `user:${req.userId}` : clientIp(req)),
});
