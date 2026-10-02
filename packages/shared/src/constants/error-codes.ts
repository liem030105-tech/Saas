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

/** `details[0].rule` of a 422 BUSINESS_RULE_VIOLATION (docs/api/README.md → Canonical error format). */
export const BUSINESS_RULES = [
  /** The last OWNER cannot leave, be removed, or be demoted (permission matrix footnote 1). */
  'LAST_OWNER',
  /** A card can move only within its workspace (invariant I6, CARD-003). */
  'CROSS_WORKSPACE_MOVE',
  /** A card can carry only its own board's labels (invariant I2, CARD-005). */
  'LABEL_OTHER_BOARD',
  /** Only a member of the card's workspace can be assigned to it (invariant I3, CARD-005). */
  'NOT_WORKSPACE_MEMBER',
  /** A card's cover must be one of its own image attachments (ATTACHMENTS-001). */
  'COVER_NOT_IMAGE_OF_CARD',
] as const;

export type BusinessRule = (typeof BUSINESS_RULES)[number];
