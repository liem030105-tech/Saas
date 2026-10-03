import { PLAN_LIMITS, PLANS, type Plan } from '@trello-clone/shared';
import multer from 'multer';

import { AppError } from '../lib/app-error';
import { fileTooLarge } from '../modules/billing/billing.service';

import type { NextFunction, Request, Response } from 'express';

// One multipart file in memory (ATTACHMENTS-001, security.md → File uploads): nothing touches the
// server's disk, and the plan's size limit (D-10, BILLING-001) is enforced while it streams in.
const singleFor = Object.fromEntries(
  PLANS.map((plan) => [
    plan,
    multer({
      storage: multer.memoryStorage(),
      // Browsers send the file name as UTF-8 (multer's default would read it as latin1).
      defParamCharset: 'utf8',
      limits: { fileSize: PLAN_LIMITS[plan].maxFileBytes, files: 1, fields: 0 },
    }).single('file'),
  ]),
) as Record<Plan, ReturnType<ReturnType<typeof multer>['single']>>;

/**
 * Express middleware after the route has authorized the upload and set `res.locals.uploadPlan`
 * (the card's workspace plan): `req.file` holds the upload (field `file`), or the request is refused.
 */
export function uploadFile(req: Request, res: Response, next: NextFunction) {
  const plan: Plan = res.locals.uploadPlan ?? 'FREE';
  singleFor[plan](req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') return next(fileTooLarge(plan));
      return next(
        new AppError('VALIDATION_ERROR', 400, 'Send one file in the "file" field', [
          { path: 'file', message: 'Send one file in the "file" field' },
        ]),
      );
    }
    if (error) return next(error);
    if (!req.file || req.file.size === 0) {
      return next(
        new AppError('VALIDATION_ERROR', 400, 'Choose a file to attach', [
          { path: 'file', message: 'Choose a file to attach' },
        ]),
      );
    }
    next();
  });
}
