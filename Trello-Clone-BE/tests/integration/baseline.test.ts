import { ErrorResponseSchema } from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { anyId, publicRoutes } from '../data/baseline';
import { resetDb, testPrisma } from '../helpers/db';
import { registeredRoutes } from '../helpers/routes';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

// TESTING-001: two of the five baseline cases every endpoint needs (docs/development/testing.md
// → Baseline), checked for every route the app registers, so a new route cannot miss them:
// 401 without a token, and 400 for invalid input on each route that validates it. Non-member
// (404) and role (403) cases are the tenant-isolation and role-matrix suites; happy paths are in
// each module's own file. Each list has a coverage test that walks the app's routes.

const app = createTestApp();
const routes = registeredRoutes(app);
const API = '/api/v1';

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
  await testPrisma.$disconnect();
});

/** The route's path with every `:param` replaced by a well-formed id nothing has. */
const concrete = (path: string) => `${API}${path.replace(/:[A-Za-z]+/g, anyId)}`;

const send = (route: string) => {
  const [method, path] = route.split(' ') as [string, string];
  const url = concrete(path);
  switch (method) {
    case 'GET':
      return request(app).get(url);
    case 'POST':
      return request(app).post(url);
    case 'PATCH':
      return request(app).patch(url);
    case 'DELETE':
      return request(app).delete(url);
    default:
      throw new Error(`No sender for ${method}`);
  }
};

const authenticated = routes.filter(({ handlers }) => handlers.includes('authenticate'));

describe('401 without a token', () => {
  it('every route needs a token, except the public ones', () => {
    const open = routes.filter(({ handlers }) => !handlers.includes('authenticate'));
    expect(open.map(({ route }) => route).sort()).toEqual([...publicRoutes].sort());
  });

  it.each(authenticated.map(({ route }) => route))('%s', async (route) => {
    const res = await send(route).send({});
    expect(res.status).toBe(401);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('UNAUTHORIZED');
  });
});

/**
 * One invalid input per route that validates (the `validate` middleware): sent by a signed-in
 * user, it is refused before any lookup, so the ids need not exist.
 */
const invalidInputs: Record<string, { query?: Record<string, string>; body?: object }> = {
  'POST /auth/register': { body: { email: 'not-an-email', password: 'x', name: '' } },
  'POST /auth/login': { body: { email: 'not-an-email' } },
  'PATCH /users/me': { body: { name: '' } },
  'POST /workspaces': { body: { name: '' } },
  'PATCH /workspaces/:workspaceId': { body: { name: '' } },
  'PATCH /workspaces/:workspaceId/members/:userId': { body: { role: 'KING' } },
  'POST /workspaces/:workspaceId/invites': { body: { email: 'nope', role: 'MEMBER' } },
  'POST /invites/accept': { body: {} },
  'GET /workspaces/:workspaceId/boards': { query: { archived: 'maybe' } },
  'POST /workspaces/:workspaceId/boards': { body: { title: '' } },
  'PATCH /boards/:boardId': { body: { title: '' } },
  'GET /boards/:boardId/activities': { query: { limit: '0' } },
  'GET /boards/:boardId/search': { query: { due: 'someday' } },
  'POST /boards/:boardId/labels': { body: { color: 'red' } },
  'PATCH /labels/:labelId': { body: { color: 'red' } },
  'POST /boards/:boardId/lists': { body: { title: '' } },
  'PATCH /lists/:listId': { body: { title: '' } },
  'POST /lists/:listId/cards': { body: { title: '' } },
  'PATCH /cards/:cardId': { body: { title: '' } },
  'PATCH /cards/:cardId/move': { body: { listId: 'nope' } },
  'POST /cards/:cardId/checklists': { body: { title: '' } },
  'PATCH /checklists/:checklistId': { body: { title: '' } },
  'POST /checklists/:checklistId/items': { body: { content: '' } },
  'PATCH /checklists/:checklistId/items/:itemId': { body: { done: 'yes' } },
  'GET /cards/:cardId/comments': { query: { limit: '0' } },
  'POST /cards/:cardId/comments': { body: { content: '' } },
  'PATCH /comments/:commentId': { body: { content: '' } },
  'GET /notifications': { query: { unread: 'yes' } },
  'PATCH /notifications/:notificationId': { body: { read: 'yes' } },
};

describe('400 for invalid input', () => {
  it('every route that validates has a case here', () => {
    const validating = routes
      .filter(({ handlers }) => handlers.includes('validateRequest'))
      .map(({ route }) => route);
    expect(validating.length).toBeGreaterThan(0);
    expect(Object.keys(invalidInputs).sort()).toEqual(validating.sort());
  });

  it.each(Object.entries(invalidInputs))('%s', async (route, input) => {
    const { token } = await createUserWithToken();
    let req = send(route).set(bearer(token));
    if (input.query) req = req.query(input.query);
    const res = await req.send(input.body ?? {});

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    const { error } = ErrorResponseSchema.parse(res.body);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.length).toBeGreaterThan(0);
  });
});
