import * as attachmentsService from './attachments.service';
import { currentUserId } from '../../middlewares/authenticate';

import type { NextFunction, Request, Response } from 'express';

// Attachments (ATTACHMENTS-001): authorized in the service, on the card's stored board.

/** Before `uploadFile`: authorizes the upload and picks the plan's size limit (res.locals.uploadPlan). */
export async function authorizeUpload(req: Request, res: Response, next: NextFunction) {
  res.locals.uploadPlan = await attachmentsService.uploadPlan(
    currentUserId(req),
    req.params.cardId as string,
  );
  next();
}

export async function upload(req: Request, res: Response) {
  // uploadFile (middlewares/upload.ts) has refused a request without a file.
  const attachment = await attachmentsService.upload(
    currentUserId(req),
    req.params.cardId as string,
    req.file!,
  );
  res.status(201).json({ data: attachment });
}

export async function remove(req: Request, res: Response) {
  await attachmentsService.remove(currentUserId(req), req.params.attachmentId as string);
  res.status(204).end();
}
