// Codes from docs/api/README.md → Canonical error format. They move to @trello-clone/shared in FOUNDATION-005.
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'INVALID_CREDENTIALS',
  'TOKEN_REUSED',
  'PLAN_LIMIT_REACHED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
  'BUSINESS_RULE_VIOLATION',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorDetail {
  path?: string;
  message: string;
  [key: string]: unknown;
}

export class AppError extends Error {
  override readonly name = 'AppError';

  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly details: ErrorDetail[] = [],
  ) {
    super(message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError('NOT_FOUND', 404, message);
  }

  static forbidden(message = 'You do not have permission to do this') {
    return new AppError('FORBIDDEN', 403, message);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError('UNAUTHORIZED', 401, message);
  }
}
