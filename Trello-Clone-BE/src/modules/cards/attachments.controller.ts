import * as attachmentsService from './attachments.service';
import { currentUserId } from '../../middlewares/authenticate';

import type { Request, Response } from 'express';

// Attachments (ATTACHMENTS-001): authorized in the service, on the card's stored board.

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
