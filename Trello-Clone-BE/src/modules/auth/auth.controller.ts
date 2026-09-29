import { z } from 'zod';

import * as authService from './auth.service';
import { clearRefreshCookie, REFRESH_COOKIE_NAME, setRefreshCookie } from './cookie';
import { AppError } from '../../lib/app-error';
import { currentUserId } from '../../middlewares/authenticate';
import { validated } from '../../middlewares/validate';
import * as usersService from '../users/users.service';

import type { AuthResponse, LoginData, RefreshResponse, RegisterData } from '@trello-clone/shared';
import type { Request, Response } from 'express';

const RefreshCookieSchema = z.string().min(1);

export async function register(_req: Request, res: Response) {
  const { body } = validated<unknown, unknown, RegisterData>(res);
  const { user, accessToken, refreshToken } = await authService.register(body);
  setRefreshCookie(res, refreshToken.raw, refreshToken.expiresAt);
  const data: AuthResponse = { user, accessToken };
  res.status(201).json({ data });
}

export async function login(_req: Request, res: Response) {
  const { body } = validated<unknown, unknown, LoginData>(res);
  const { user, accessToken, refreshToken } = await authService.login(body);
  setRefreshCookie(res, refreshToken.raw, refreshToken.expiresAt);
  const data: AuthResponse = { user, accessToken };
  res.status(200).json({ data });
}

/** The refresh cookie's value; cookie-parser turns `j:`-prefixed values into JSON, so anything but a non-empty string counts as no cookie. */
const presentedRefreshToken = (req: Request) =>
  RefreshCookieSchema.safeParse((req.cookies as Record<string, unknown>)[REFRESH_COOKIE_NAME]).data;

export async function refresh(req: Request, res: Response) {
  const presented = presentedRefreshToken(req);
  try {
    const { accessToken, refreshToken } = await authService.refresh(presented);
    setRefreshCookie(res, refreshToken.raw, refreshToken.expiresAt);
    const data: RefreshResponse = { accessToken };
    res.status(200).json({ data });
  } catch (error) {
    // A cookie that cannot refresh (missing, unknown, expired, replayed) is useless: drop it.
    if (error instanceof AppError && error.status === 401) clearRefreshCookie(res);
    throw error;
  }
}

export async function me(req: Request, res: Response) {
  const user = await usersService.getMe(currentUserId(req));
  res.status(200).json({ data: user });
}

/** Always 204 and a cleared cookie, whether or not the cookie was valid (idempotent). */
export async function logout(req: Request, res: Response) {
  await authService.logout(presentedRefreshToken(req));
  clearRefreshCookie(res);
  res.status(204).end();
}
