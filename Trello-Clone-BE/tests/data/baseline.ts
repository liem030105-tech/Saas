// Baseline-case test data (TESTING-001, tests/integration/baseline.test.ts).

/** A well-formed id nothing has: path parameters of the 401 and 400 cases. */
export const anyId = 'clx0000000000000000000099';

/** Routes that need no token, each for its own reason (docs/development/testing.md → Baseline). */
export const publicRoutes = [
  'GET /health',
  'POST /auth/register',
  'POST /auth/login',
  // The refresh-token cookie authenticates these two (AUTH-001).
  'POST /auth/refresh',
  'POST /auth/logout',
  // Stripe's signature authenticates it (BILLING-001).
  'POST /billing/webhook',
] as const;

/**
 * Routes that are only the caller's own data: no workspace role to vary, so no role-matrix case
 * (docs/development/testing.md → Baseline); their own tests show each caller sees only their data.
 */
export const perUserRoutes = [
  'GET /auth/me',
  'PATCH /users/me',
  'GET /workspaces',
  'POST /workspaces',
  'POST /invites/accept',
  'POST /invites/:inviteId/accept',
  'GET /notifications',
  'GET /notifications/unread-count',
  'POST /notifications/read-all',
  'PATCH /notifications/:notificationId',
] as const;
