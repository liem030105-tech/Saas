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

/**
 * One invalid input per route that validates (the `validate` middleware), for the 400 cases:
 * each breaks exactly one field, `path` (as `details[].path` names it), and is refused before any
 * lookup, so the ids in the path need not exist.
 */
export const invalidInputs: Record<
  string,
  { query?: Record<string, string>; body?: object; path: string }
> = {
  'POST /auth/register': {
    body: { email: 'baseline@example.com', password: 'correct-horse-battery-1', name: '' },
    path: 'name',
  },
  'POST /auth/login': { body: { email: 'not-an-email', password: 'x' }, path: 'email' },
  'PATCH /users/me': { body: { name: '' }, path: 'name' },
  'POST /workspaces': { body: { name: '' }, path: 'name' },
  'PATCH /workspaces/:workspaceId': { body: { name: '' }, path: 'name' },
  'PATCH /workspaces/:workspaceId/members/:userId': { body: { role: 'KING' }, path: 'role' },
  'POST /workspaces/:workspaceId/invites': {
    body: { email: 'nope', role: 'MEMBER' },
    path: 'email',
  },
  'POST /invites/accept': { body: {}, path: 'token' },
  'GET /workspaces/:workspaceId/boards': { query: { archived: 'maybe' }, path: 'archived' },
  'POST /workspaces/:workspaceId/boards': { body: { title: '' }, path: 'title' },
  'PATCH /boards/:boardId': { body: { title: '' }, path: 'title' },
  'GET /boards/:boardId/activities': { query: { limit: '0' }, path: 'limit' },
  'GET /boards/:boardId/search': { query: { due: 'someday' }, path: 'due' },
  'POST /boards/:boardId/labels': { body: { color: 'red' }, path: 'color' },
  'PATCH /labels/:labelId': { body: { color: 'red' }, path: 'color' },
  'POST /boards/:boardId/lists': { body: { title: '' }, path: 'title' },
  'PATCH /lists/:listId': { body: { title: '' }, path: 'title' },
  'POST /lists/:listId/cards': { body: { title: '' }, path: 'title' },
  'PATCH /cards/:cardId': { body: { title: '' }, path: 'title' },
  'PATCH /cards/:cardId/move': { body: { listId: 'nope', position: 1 }, path: 'listId' },
  'POST /cards/:cardId/checklists': { body: { title: '' }, path: 'title' },
  'PATCH /checklists/:checklistId': { body: { title: '' }, path: 'title' },
  'POST /checklists/:checklistId/items': { body: { content: '' }, path: 'content' },
  'PATCH /checklists/:checklistId/items/:itemId': { body: { done: 'yes' }, path: 'done' },
  'GET /cards/:cardId/comments': { query: { limit: '0' }, path: 'limit' },
  'POST /cards/:cardId/comments': { body: { content: '' }, path: 'content' },
  'PATCH /comments/:commentId': { body: { content: '' }, path: 'content' },
  'GET /notifications': { query: { unread: 'yes' }, path: 'unread' },
  'PATCH /notifications/:notificationId': { body: { read: 'yes' }, path: 'read' },
};
