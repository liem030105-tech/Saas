import { MAX_ATTACHMENT_BYTES } from '@trello-clone/shared';
import multer from 'multer';

import { AppError } from '../lib/app-error';

import type { NextFunction, Request, Response } from 'express';

// One multipart file in memory (ATTACHMENTS-001, security.md → File uploads): nothing touches the
// server's disk, and the size limit (D-10) is enforced while it streams in.
const single = multer({
  storage: multer.memoryStorage(),
  // Browsers send the file name as UTF-8 (multer's default would read it as latin1).
  defParamCharset: 'utf8',
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 0 },
}).single('file');

const tooLarge = () =>
  new AppError(
    'FILE_TOO_LARGE',
    413,
    `The file is larger than ${MAX_ATTACHMENT_BYTES / 2 ** 20} MB`,
  );

/** Express middleware: `req.file` holds the upload (field `file`), or the request is refused. */
export function uploadFile(req: Request, res: Response, next: NextFunction) {
  single(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') return next(tooLarge());
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
