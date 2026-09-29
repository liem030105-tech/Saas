import * as authService from './auth.service';
import { setRefreshCookie } from './cookie';
import { validated } from '../../middlewares/validate';

import type { AuthResponse, RegisterData } from '@trello-clone/shared';
import type { Request, Response } from 'express';

export async function register(_req: Request, res: Response) {
  const { body } = validated<unknown, unknown, RegisterData>(res);
  const { user, accessToken, refreshToken } = await authService.register(body);
  setRefreshCookie(res, refreshToken.raw, refreshToken.expiresAt);
  const data: AuthResponse = { user, accessToken };
  res.status(201).json({ data });
}
