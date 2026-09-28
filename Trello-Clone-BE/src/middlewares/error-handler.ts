import { ZodError } from 'zod';

import { AppError, type ErrorCode, type ErrorDetail } from '../lib/app-error';

import type { NextFunction, Request, Response } from 'express';

interface ErrorBody {
  code: ErrorCode;
  message: string;
  details: ErrorDetail[];
}

// body-parser errors carry `type` and `status` (malformed JSON, body over the 1 MB limit).
function isBodyParserError(error: unknown): error is { type: string; status: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { type?: unknown }).type === 'string' &&
    typeof (error as { status?: unknown }).status === 'number'
  );
}

function toErrorResponse(error: unknown): { status: number; body: ErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: { code: error.code, message: error.message, details: error.details },
    };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      },
    };
  }
  if (isBodyParserError(error)) {
    if (error.type === 'entity.too.large') {
      return {
        status: 413,
        body: { code: 'FILE_TOO_LARGE', message: 'Request body is too large', details: [] },
      };
    }
    if (error.status >= 400 && error.status < 500) {
      return {
        status: 400,
        body: { code: 'VALIDATION_ERROR', message: 'Malformed request body', details: [] },
      };
    }
  }
  return {
    status: 500,
    body: { code: 'INTERNAL_ERROR', message: 'Something went wrong', details: [] },
  };
}

/** Last middleware: every error leaves in the canonical format, never with a stack trace. */
export function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    next(error);
    return;
  }
  const { status, body } = toErrorResponse(error);
  if (status >= 500) req.log.error({ err: error }, 'Unhandled error');
  res.status(status).json({ error: { ...body, requestId: res.locals.requestId as string } });
}
