import { AppError } from '../lib/app-error';
import { verifyAccessToken } from '../modules/auth/tokens';

import type { NextFunction, Request, Response } from 'express';

// docs/architecture/security.md → Authentication vs. authorization. Every protected route starts
// with this middleware; authorization (workspace roles) is a separate, later step.

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

/**
 * Verifies `Authorization: Bearer <access token>` and sets `req.userId`. A missing header, another
 * scheme, or an expired, malformed, or wrongly signed token → 401 UNAUTHORIZED (same body for all).
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = BEARER.exec(req.get('authorization') ?? '')?.[1];
  if (!token) throw AppError.unauthorized();
  try {
    req.userId = await verifyAccessToken(token);
  } catch {
    throw AppError.unauthorized();
  }
  next();
}

/** The authenticated user's id; only for handlers behind `authenticate`. */
export function currentUserId(req: Request): string {
  if (!req.userId) throw AppError.unauthorized();
  return req.userId;
}
