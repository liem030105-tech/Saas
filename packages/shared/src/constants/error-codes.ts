// Every `error.code` the API can return (docs/api/README.md → Canonical error format).
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
