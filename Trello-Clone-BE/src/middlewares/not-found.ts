import { AppError } from '../lib/app-error';

import type { NextFunction, Request, Response } from 'express';

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(AppError.notFound('Route not found'));
}
