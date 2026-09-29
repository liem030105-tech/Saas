import { z } from 'zod';

import * as authService from './auth.service';
import { clearRefreshCookie, REFRESH_COOKIE_NAME, setRefreshCookie } from './cookie';
import { AppError } from '../../lib/app-error';
import { validated } from '../../middlewares/validate';

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

export async function refresh(req: Request, res: Response) {
  // cookie-parser turns `j:`-prefixed values into JSON: anything but a non-empty string is "no cookie".
  const cookie: unknown = (req.cookies as Record<string, unknown>)[REFRESH_COOKIE_NAME];
  const presented = RefreshCookieSchema.safeParse(cookie).data;
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
