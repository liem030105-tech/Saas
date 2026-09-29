import { env } from '../../config/env';

import type { CookieOptions, Response } from 'express';

// docs/api/authentication.md → Refresh cookie.
export const REFRESH_COOKIE_NAME = 'refresh_token';
/** Only the auth endpoints receive the cookie. Must match API_PREFIX + '/auth'. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

const baseOptions = (): CookieOptions => ({
  httpOnly: true,
  // `Secure` is dropped only in development, where the API runs on http://localhost.
  secure: env.NODE_ENV !== 'development',
  sameSite: 'strict',
  path: REFRESH_COOKIE_PATH,
});

/** Sets the refresh cookie to live exactly until the family's absolute expiry (D-02). */
export function setRefreshCookie(res: Response, rawToken: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, {
    ...baseOptions(),
    // Whole seconds, rounded up: Express floors Max-Age, which would advertise 1s less than D-02.
    maxAge: Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000) * 1000),
  });
}

/** Clears the cookie; the path must match the one it was set with, or the browser keeps it. */
export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions());
}
