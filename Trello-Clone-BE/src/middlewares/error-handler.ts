import { ZodError } from 'zod';

import { AppError } from '../lib/app-error';
import { reportError } from '../lib/error-tracking';

import type { ErrorResponse } from '@trello-clone/shared';
import type { NextFunction, Request, Response } from 'express';

/** The shared contract minus requestId, which errorHandler adds from the request. */
type ErrorBody = Omit<ErrorResponse['error'], 'requestId'>;

// Errors from Express and its parsers carry an HTTP status: body-parser (malformed JSON, body
// over 1 MB, with a `type`) and the router (a path parameter that cannot be URI-decoded).
function httpClientError(error: unknown): { status: number; type?: unknown } | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { status, statusCode, type } = error as {
    status?: unknown;
    statusCode?: unknown;
    type?: unknown;
  };
  const code = typeof status === 'number' ? status : statusCode;
  return typeof code === 'number' && code >= 400 && code < 500 ? { status: code, type } : undefined;
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
  const clientError = httpClientError(error);
  if (clientError?.type === 'entity.too.large') {
    return {
      status: 413,
      body: { code: 'FILE_TOO_LARGE', message: 'Request body is too large', details: [] },
    };
  }
  if (clientError) {
    return {
      status: 400,
      body: { code: 'VALIDATION_ERROR', message: 'Malformed request', details: [] },
    };
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
  const requestId = res.locals.requestId as string;
  if (status >= 500) {
    req.log.error({ err: error }, 'Unhandled error');
    reportError(error, requestId);
  }
  const payload: ErrorResponse = { error: { ...body, requestId } };
  res.status(status).json(payload);
}
