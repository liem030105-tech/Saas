import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { boardData } from '../data/boards';
import { cardData } from '../data/cards';
import { paths } from '../data/http';
import { labelData } from '../data/labels';
import { listData } from '../data/lists';
import { tenantData } from '../data/workspaces';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { createTwoTenants, snapshotWorkspace, type Tenant } from '../helpers/two-tenants';
import { bearer } from '../helpers/users';

import type { Express } from 'express';

// Tenant isolation (WORKSPACE-006, docs/api/README.md → Tenant isolation rules): tenant A, the
// OWNER of their own workspace, calls every /workspaces/* and /invites/* endpoint against tenant
// B's data. Each call must reveal nothing (404, or no trace of B) and leave B's rows unchanged.
// New endpoints add a case here; the coverage test below walks the whole app and fails until they
// do.

let app: Express;

beforeAll(() => {
  app = createTestApp();
});
beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
  await testPrisma.$disconnect();
});

interface IsolationCase {
  /** `METHOD /route/pattern` exactly as registered, to match the coverage check. */
  route: string;
  /** What the case tries, for the test name. */
  attempt: string;
  request: (a: Tenant, b: Tenant) => request.Test;
  /** Checks the response reveals nothing of B (default: a 404 identical to `missing`'s). */
  expectResponse?: (res: request.Response, b: Tenant) => void;
  /**
   * The same request with B's id replaced by one nothing has: the two 404 bodies must be equal,
   * so a foreign id never looks different from a missing one (isolation rule 3).
   */
  missing?: (a: Tenant) => request.Test;
}

const ws = (workspaceId: string) => `${paths.workspaces}/${workspaceId}`;
const board = (boardId: string) => `${paths.boards}/${boardId}`;
const list = (listId: string) => `${paths.lists}/${listId}`;
const card = (cardId: string) => `${paths.cards}/${cardId}`;
const label = (labelId: string) => `${paths.labels}/${labelId}`;
const checklist = (checklistId: string) => `${paths.checklists}/${checklistId}`;
const item = (checklistId: string, itemId: string) => `${checklist(checklistId)}/items/${itemId}`;
const comment = (commentId: string) => `${paths.comments}/${commentId}`;
const expect404 = (res: request.Response) => {
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('NOT_FOUND');
};

/** The error body without the per-request id. */
const errorOf = (res: request.Response) => ({ ...res.body.error, requestId: null });

/** Nothing identifying tenant B appears in the response. */
const expectNoTraceOf = (res: request.Response, b: Tenant) => {
  expect(res.status).toBe(200);
  const body = JSON.stringify(res.body);
  for (const value of [
    b.workspaceId,
    b.owner.user.id,
    b.member.user.id,
    b.inviteId,
    b.boardId,
    b.listId,
    b.cardId,
    boardData.tenantBoard.b,
    listData.tenantList.b,
    cardData.tenantCard.b,
    tenantData.inviteEmail.b,
  ]) {
    expect(body).not.toContain(value);
  }
};

const { missingId } = tenantData;

const cases: IsolationCase[] = [
  {
    route: 'GET /workspaces',
    attempt: "list: B's workspace is not in A's list",
    request: (a) => request(app).get(paths.workspaces).set(bearer(a.owner.token)),
    expectResponse: (res, b) => {
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(b.workspaceId);
    },
  },
  {
    route: 'POST /workspaces',
    attempt: "create with B's name: the slug collision gives A a new workspace, not B's",
    request: (a) =>
      request(app)
        .post(paths.workspaces)
        .set(bearer(a.owner.token))
        .send({ name: tenantData.workspaceName.b }),
    expectResponse: (res, b) => {
      expect(res.status).toBe(201);
      expect(res.body.data.id).not.toBe(b.workspaceId);
      expect(res.body.data.slug).not.toBe(b.slug);
    },
  },
  {
    route: 'GET /workspaces/:workspaceId',
    attempt: "read B's workspace",
    request: (a, b) => request(app).get(ws(b.workspaceId)).set(bearer(a.owner.token)),
    missing: (a) => request(app).get(ws(missingId)).set(bearer(a.owner.token)),
  },
  {
    route: 'PATCH /workspaces/:workspaceId',
    attempt: "rename B's workspace",
    request: (a, b) =>
      request(app).patch(ws(b.workspaceId)).set(bearer(a.owner.token)).send(tenantData.rename),
    missing: (a) =>
      request(app).patch(ws(missingId)).set(bearer(a.owner.token)).send(tenantData.rename),
  },
  {
    route: 'PATCH /workspaces/:workspaceId',
    attempt: "take B's slug for A's own workspace (a 409 would be fine, B stays unchanged)",
    request: (a, b) =>
      request(app).patch(ws(a.workspaceId)).set(bearer(a.owner.token)).send({ slug: b.slug }),
    expectResponse: (res) => expect(res.status).toBe(409),
  },
  {
    route: 'DELETE /workspaces/:workspaceId',
    attempt: "delete B's workspace",
    request: (a, b) => request(app).delete(ws(b.workspaceId)).set(bearer(a.owner.token)),
    missing: (a) => request(app).delete(ws(missingId)).set(bearer(a.owner.token)),
  },
  {
    route: 'GET /workspaces/:workspaceId/members',
    attempt: "list B's members",
    request: (a, b) =>
      request(app)
        .get(`${ws(b.workspaceId)}/members`)
        .set(bearer(a.owner.token)),
    missing: (a) =>
      request(app)
        .get(`${ws(missingId)}/members`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'GET /workspaces/:workspaceId/members',
    attempt: "list A's own members: none of B's appear (rule 5)",
    request: (a) =>
      request(app)
        .get(`${ws(a.workspaceId)}/members`)
        .set(bearer(a.owner.token)),
    expectResponse: expectNoTraceOf,
  },
  {
    route: 'PATCH /workspaces/:workspaceId/members/:userId',
    attempt: "change a role in B's workspace",
    request: (a, b) =>
      request(app)
        .patch(`${ws(b.workspaceId)}/members/${b.member.user.id}`)
        .set(bearer(a.owner.token))
        .send(tenantData.roleChange),
  },
  {
    route: 'PATCH /workspaces/:workspaceId/members/:userId',
    attempt: "change B's member through A's own workspace",
    request: (a, b) =>
      request(app)
        .patch(`${ws(a.workspaceId)}/members/${b.member.user.id}`)
        .set(bearer(a.owner.token))
        .send(tenantData.roleChange),
    missing: (a) =>
      request(app)
        .patch(`${ws(a.workspaceId)}/members/${missingId}`)
        .set(bearer(a.owner.token))
        .send(tenantData.roleChange),
  },
  {
    route: 'DELETE /workspaces/:workspaceId/members/:userId',
    attempt: "remove a member of B's workspace",
    request: (a, b) =>
      request(app)
        .delete(`${ws(b.workspaceId)}/members/${b.member.user.id}`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'DELETE /workspaces/:workspaceId/members/:userId',
    attempt: "remove B's owner through A's own workspace",
    request: (a, b) =>
      request(app)
        .delete(`${ws(a.workspaceId)}/members/${b.owner.user.id}`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'GET /workspaces/:workspaceId/invites',
    attempt: "list B's invites",
    request: (a, b) =>
      request(app)
        .get(`${ws(b.workspaceId)}/invites`)
        .set(bearer(a.owner.token)),
    missing: (a) =>
      request(app)
        .get(`${ws(missingId)}/invites`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'GET /workspaces/:workspaceId/invites',
    attempt: "list A's own invites: none of B's appear (rule 5)",
    request: (a) =>
      request(app)
        .get(`${ws(a.workspaceId)}/invites`)
        .set(bearer(a.owner.token)),
    expectResponse: expectNoTraceOf,
  },
  {
    route: 'POST /workspaces/:workspaceId/invites',
    attempt: "invite someone into B's workspace",
    request: (a, b) =>
      request(app)
        .post(`${ws(b.workspaceId)}/invites`)
        .set(bearer(a.owner.token))
        .send(tenantData.newInvite),
  },
  {
    route: 'DELETE /workspaces/:workspaceId/invites/:inviteId',
    attempt: "revoke an invite of B's workspace",
    request: (a, b) =>
      request(app)
        .delete(`${ws(b.workspaceId)}/invites/${b.inviteId}`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'DELETE /workspaces/:workspaceId/invites/:inviteId',
    attempt: "revoke B's invite through A's own workspace",
    request: (a, b) =>
      request(app)
        .delete(`${ws(a.workspaceId)}/invites/${b.inviteId}`)
        .set(bearer(a.owner.token)),
    missing: (a) =>
      request(app)
        .delete(`${ws(a.workspaceId)}/invites/${missingId}`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'POST /invites/accept',
    attempt: "accept B's invite (someone else's email)",
    request: (a, b) =>
      request(app)
        .post(paths.invitesAccept)
        .set(bearer(a.owner.token))
        .send({ token: b.inviteToken }),
  },
  {
    route: 'GET /workspaces/:workspaceId/boards',
    attempt: "list B's boards",
    request: (a, b) =>
      request(app)
        .get(`${ws(b.workspaceId)}/boards`)
        .set(bearer(a.owner.token)),
    missing: (a) =>
      request(app)
        .get(`${ws(missingId)}/boards`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'GET /workspaces/:workspaceId/boards',
    attempt: "list A's own boards: none of B's appear (rule 5)",
    request: (a) =>
      request(app)
        .get(`${ws(a.workspaceId)}/boards`)
        .set(bearer(a.owner.token)),
    expectResponse: expectNoTraceOf,
  },
  {
    route: 'POST /workspaces/:workspaceId/boards',
    attempt: "create a board in B's workspace",
    request: (a, b) =>
      request(app)
        .post(`${ws(b.workspaceId)}/boards`)
        .set(bearer(a.owner.token))
        .send({ title: boardData.tenantBoard.a }),
    missing: (a) =>
      request(app)
        .post(`${ws(missingId)}/boards`)
        .set(bearer(a.owner.token))
        .send({ title: boardData.tenantBoard.a }),
  },
  {
    route: 'GET /boards/:boardId',
    attempt: "open B's board",
    request: (a, b) => request(app).get(board(b.boardId)).set(bearer(a.owner.token)),
    missing: (a) => request(app).get(board(missingId)).set(bearer(a.owner.token)),
  },
  {
    route: 'PATCH /boards/:boardId',
    attempt: "rename or archive B's board",
    request: (a, b) =>
      request(app)
        .patch(board(b.boardId))
        .set(bearer(a.owner.token))
        .send({ title: boardData.tenantBoard.a, archived: true }),
    missing: (a) =>
      request(app)
        .patch(board(missingId))
        .set(bearer(a.owner.token))
        .send({ title: boardData.tenantBoard.a, archived: true }),
  },
  {
    route: 'DELETE /boards/:boardId',
    attempt: "delete B's board",
    request: (a, b) => request(app).delete(board(b.boardId)).set(bearer(a.owner.token)),
    missing: (a) => request(app).delete(board(missingId)).set(bearer(a.owner.token)),
  },
  {
    route: 'POST /boards/:boardId/lists',
    attempt: "add a list to B's board",
    request: (a, b) =>
      request(app)
        .post(`${board(b.boardId)}/lists`)
        .set(bearer(a.owner.token))
        .send({ title: listData.tenantList.a }),
    missing: (a) =>
      request(app)
        .post(`${board(missingId)}/lists`)
        .set(bearer(a.owner.token))
        .send({ title: listData.tenantList.a }),
  },
  {
    route: 'PATCH /lists/:listId',
    attempt: "rename or archive B's list",
    request: (a, b) =>
      request(app)
        .patch(list(b.listId))
        .set(bearer(a.owner.token))
        .send({ title: listData.tenantList.a, archived: true }),
    missing: (a) =>
      request(app)
        .patch(list(missingId))
        .set(bearer(a.owner.token))
        .send({ title: listData.tenantList.a, archived: true }),
  },
  {
    route: 'DELETE /lists/:listId',
    attempt: "delete B's list",
    request: (a, b) => request(app).delete(list(b.listId)).set(bearer(a.owner.token)),
    missing: (a) => request(app).delete(list(missingId)).set(bearer(a.owner.token)),
  },
  {
    route: 'POST /lists/:listId/cards',
    attempt: "add a card to B's list",
    request: (a, b) =>
      request(app)
        .post(`${list(b.listId)}/cards`)
        .set(bearer(a.owner.token))
        .send({ title: cardData.tenantCard.a }),
    missing: (a) =>
      request(app)
        .post(`${list(missingId)}/cards`)
        .set(bearer(a.owner.token))
        .send({ title: cardData.tenantCard.a }),
  },
  {
    route: 'GET /cards/:cardId',
    attempt: "open B's card",
    request: (a, b) => request(app).get(card(b.cardId)).set(bearer(a.owner.token)),
    missing: (a) => request(app).get(card(missingId)).set(bearer(a.owner.token)),
  },
  {
    route: 'PATCH /cards/:cardId',
    attempt: "edit or archive B's card",
    request: (a, b) =>
      request(app)
        .patch(card(b.cardId))
        .set(bearer(a.owner.token))
        .send({ title: cardData.tenantCard.a, archived: true }),
    missing: (a) =>
      request(app)
        .patch(card(missingId))
        .set(bearer(a.owner.token))
        .send({ title: cardData.tenantCard.a, archived: true }),
  },
  {
    route: 'DELETE /cards/:cardId',
    attempt: "delete B's card",
    request: (a, b) => request(app).delete(card(b.cardId)).set(bearer(a.owner.token)),
    missing: (a) => request(app).delete(card(missingId)).set(bearer(a.owner.token)),
  },
  {
    route: 'PATCH /cards/:cardId/move',
    attempt: "move B's card into A's own list",
    request: (a, b) =>
      request(app)
        .patch(`${card(b.cardId)}/move`)
        .set(bearer(a.owner.token))
        .send({ listId: a.listId, position: 512 }),
    missing: (a) =>
      request(app)
        .patch(`${card(missingId)}/move`)
        .set(bearer(a.owner.token))
        .send({ listId: a.listId, position: 512 }),
  },
  {
    route: 'PATCH /cards/:cardId/move',
    attempt: "move A's own card into B's list (the list is not visible)",
    request: (a, b) =>
      request(app)
        .patch(`${card(a.cardId)}/move`)
        .set(bearer(a.owner.token))
        .send({ listId: b.listId, position: 512 }),
    missing: (a) =>
      request(app)
        .patch(`${card(a.cardId)}/move`)
        .set(bearer(a.owner.token))
        .send({ listId: missingId, position: 512 }),
  },
  {
    route: 'GET /boards/:boardId/activities',
    attempt: "read B's activity",
    request: (a, b) =>
      request(app)
        .get(`${board(b.boardId)}/activities`)
        .set(bearer(a.owner.token)),
    missing: (a) =>
      request(app)
        .get(`${board(missingId)}/activities`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'GET /boards/:boardId/activities',
    attempt: "filter A's activity by B's card",
    request: (a, b) =>
      request(app)
        .get(`${board(a.boardId)}/activities`)
        .query({ cardId: b.cardId })
        .set(bearer(a.owner.token)),
    missing: (a) =>
      request(app)
        .get(`${board(a.boardId)}/activities`)
        .query({ cardId: missingId })
        .set(bearer(a.owner.token)),
  },
  {
    route: 'GET /boards/:boardId/activities',
    attempt: "page A's activity from B's entry as the cursor",
    request: (a, b) =>
      request(app)
        .get(`${board(a.boardId)}/activities`)
        .query({ cursor: b.activityId })
        .set(bearer(a.owner.token)),
    // A foreign cursor is refused exactly like an unknown one (`missing`), revealing nothing.
    expectResponse: (res) => {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    },
    missing: (a) =>
      request(app)
        .get(`${board(a.boardId)}/activities`)
        .query({ cursor: missingId })
        .set(bearer(a.owner.token)),
  },
  {
    route: 'GET /boards/:boardId/labels',
    attempt: "list B's labels",
    request: (a, b) =>
      request(app)
        .get(`${board(b.boardId)}/labels`)
        .set(bearer(a.owner.token)),
    missing: (a) =>
      request(app)
        .get(`${board(missingId)}/labels`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'POST /boards/:boardId/labels',
    attempt: "add a label to B's board",
    request: (a, b) =>
      request(app)
        .post(`${board(b.boardId)}/labels`)
        .set(bearer(a.owner.token))
        .send(labelData.create.input),
    missing: (a) =>
      request(app)
        .post(`${board(missingId)}/labels`)
        .set(bearer(a.owner.token))
        .send(labelData.create.input),
  },
  {
    route: 'PATCH /labels/:labelId',
    attempt: "rename B's label",
    request: (a, b) =>
      request(app).patch(label(b.labelId)).set(bearer(a.owner.token)).send({ name: 'Mine' }),
    missing: (a) =>
      request(app).patch(label(missingId)).set(bearer(a.owner.token)).send({ name: 'Mine' }),
  },
  {
    route: 'DELETE /labels/:labelId',
    attempt: "delete B's label",
    request: (a, b) => request(app).delete(label(b.labelId)).set(bearer(a.owner.token)),
    missing: (a) => request(app).delete(label(missingId)).set(bearer(a.owner.token)),
  },
  {
    route: 'POST /cards/:cardId/labels/:labelId',
    attempt: "put A's label on B's card",
    request: (a, b) =>
      request(app)
        .post(`${card(b.cardId)}/labels/${a.labelId}`)
        .set(bearer(a.owner.token)),
    missing: (a) =>
      request(app)
        .post(`${card(missingId)}/labels/${a.labelId}`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'POST /cards/:cardId/labels/:labelId',
    attempt: "put B's label on A's own card (the label is not visible)",
    request: (a, b) =>
      request(app)
        .post(`${card(a.cardId)}/labels/${b.labelId}`)
        .set(bearer(a.owner.token)),
    missing: (a) =>
      request(app)
        .post(`${card(a.cardId)}/labels/${missingId}`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'DELETE /cards/:cardId/labels/:labelId',
    attempt: "take a label off B's card",
    request: (a, b) =>
      request(app)
        .delete(`${card(b.cardId)}/labels/${b.labelId}`)
        .set(bearer(a.owner.token)),
    missing: (a) =>
      request(app)
        .delete(`${card(missingId)}/labels/${a.labelId}`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'POST /cards/:cardId/members/:userId',
    attempt: "assign A's owner to B's card",
    request: (a, b) =>
      request(app)
        .post(`${card(b.cardId)}/members/${a.owner.user.id}`)
        .set(bearer(a.owner.token)),
    missing: (a) =>
      request(app)
        .post(`${card(missingId)}/members/${a.owner.user.id}`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'POST /cards/:cardId/members/:userId',
    attempt: "assign B's owner to A's own card (not a member of A's workspace)",
    request: (a, b) =>
      request(app)
        .post(`${card(a.cardId)}/members/${b.owner.user.id}`)
        .set(bearer(a.owner.token)),
    // The same 422 as for a user id nothing has: the answer reveals nothing about B's owner.
    expectResponse: (res) => {
      expect(res.status).toBe(422);
      expect(res.body.error.details[0].rule).toBe('NOT_WORKSPACE_MEMBER');
    },
    missing: (a) =>
      request(app)
        .post(`${card(a.cardId)}/members/${missingId}`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'DELETE /cards/:cardId/members/:userId',
    attempt: "unassign B's member from B's card",
    request: (a, b) =>
      request(app)
        .delete(`${card(b.cardId)}/members/${b.member.user.id}`)
        .set(bearer(a.owner.token)),
    missing: (a) =>
      request(app)
        .delete(`${card(missingId)}/members/${a.owner.user.id}`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'POST /cards/:cardId/checklists',
    attempt: "add a checklist to B's card",
    request: (a, b) =>
      request(app)
        .post(`${card(b.cardId)}/checklists`)
        .set(bearer(a.owner.token))
        .send({ title: 'A' }),
    missing: (a) =>
      request(app)
        .post(`${card(missingId)}/checklists`)
        .set(bearer(a.owner.token))
        .send({ title: 'A' }),
  },
  {
    route: 'PATCH /checklists/:checklistId',
    attempt: "rename B's checklist",
    request: (a, b) =>
      request(app).patch(checklist(b.checklistId)).set(bearer(a.owner.token)).send({ title: 'A' }),
    missing: (a) =>
      request(app).patch(checklist(missingId)).set(bearer(a.owner.token)).send({ title: 'A' }),
  },
  {
    route: 'DELETE /checklists/:checklistId',
    attempt: "delete B's checklist",
    request: (a, b) => request(app).delete(checklist(b.checklistId)).set(bearer(a.owner.token)),
    missing: (a) => request(app).delete(checklist(missingId)).set(bearer(a.owner.token)),
  },
  {
    route: 'POST /checklists/:checklistId/items',
    attempt: "add an item to B's checklist",
    request: (a, b) =>
      request(app)
        .post(`${checklist(b.checklistId)}/items`)
        .set(bearer(a.owner.token))
        .send({ content: 'A' }),
    missing: (a) =>
      request(app)
        .post(`${checklist(missingId)}/items`)
        .set(bearer(a.owner.token))
        .send({ content: 'A' }),
  },
  {
    route: 'PATCH /checklists/:checklistId/items/:itemId',
    attempt: "tick B's item",
    request: (a, b) =>
      request(app)
        .patch(item(b.checklistId, b.itemId))
        .set(bearer(a.owner.token))
        .send({ done: true }),
    missing: (a) =>
      request(app)
        .patch(item(missingId, missingId))
        .set(bearer(a.owner.token))
        .send({ done: true }),
  },
  {
    route: 'PATCH /checklists/:checklistId/items/:itemId',
    attempt: "tick B's item through A's own checklist",
    request: (a, b) =>
      request(app)
        .patch(item(a.checklistId, b.itemId))
        .set(bearer(a.owner.token))
        .send({ done: true }),
    missing: (a) =>
      request(app)
        .patch(item(a.checklistId, missingId))
        .set(bearer(a.owner.token))
        .send({ done: true }),
  },
  {
    route: 'DELETE /checklists/:checklistId/items/:itemId',
    attempt: "delete B's item through A's own checklist",
    request: (a, b) =>
      request(app).delete(item(a.checklistId, b.itemId)).set(bearer(a.owner.token)),
    missing: (a) => request(app).delete(item(a.checklistId, missingId)).set(bearer(a.owner.token)),
  },
  {
    route: 'GET /cards/:cardId/comments',
    attempt: "read B's comments",
    request: (a, b) =>
      request(app)
        .get(`${card(b.cardId)}/comments`)
        .set(bearer(a.owner.token)),
    missing: (a) =>
      request(app)
        .get(`${card(missingId)}/comments`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'GET /cards/:cardId/comments',
    attempt: "page A's comments from B's comment as the cursor",
    request: (a, b) =>
      request(app)
        .get(`${card(a.cardId)}/comments`)
        .query({ cursor: b.commentId })
        .set(bearer(a.owner.token)),
    // A foreign cursor is refused exactly like an unknown one (`missing`), revealing nothing.
    expectResponse: (res) => {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    },
    missing: (a) =>
      request(app)
        .get(`${card(a.cardId)}/comments`)
        .query({ cursor: missingId })
        .set(bearer(a.owner.token)),
  },
  {
    route: 'POST /cards/:cardId/comments',
    attempt: "comment on B's card",
    request: (a, b) =>
      request(app)
        .post(`${card(b.cardId)}/comments`)
        .set(bearer(a.owner.token))
        .send({ content: 'A' }),
    missing: (a) =>
      request(app)
        .post(`${card(missingId)}/comments`)
        .set(bearer(a.owner.token))
        .send({ content: 'A' }),
  },
  {
    route: 'PATCH /comments/:commentId',
    attempt: "edit B's comment",
    request: (a, b) =>
      request(app).patch(comment(b.commentId)).set(bearer(a.owner.token)).send({ content: 'A' }),
    missing: (a) =>
      request(app).patch(comment(missingId)).set(bearer(a.owner.token)).send({ content: 'A' }),
  },
  {
    route: 'DELETE /comments/:commentId',
    attempt: "delete B's comment",
    request: (a, b) => request(app).delete(comment(b.commentId)).set(bearer(a.owner.token)),
    missing: (a) => request(app).delete(comment(missingId)).set(bearer(a.owner.token)),
  },
];

describe('tenant isolation: A against B', () => {
  it.each(cases)('$route: $attempt', async ({ request: send, expectResponse, missing }) => {
    const { a, b } = await createTwoTenants(app);
    const before = await snapshotWorkspace(b.workspaceId);

    const res = await send(a, b);

    if (expectResponse) expectResponse(res, b);
    else expect404(res);
    if (missing) expect(errorOf(res)).toEqual(errorOf(await missing(a)));
    expect(await snapshotWorkspace(b.workspaceId)).toEqual(before);
  });
});

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

/** `METHOD /path` of every route in the app, descending into mounted routers. */
const routesIn = (stack: Layer[]): string[] =>
  stack.flatMap((layer) => {
    if (layer.route) {
      const { path, methods } = layer.route;
      return Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`);
    }
    return layer.handle?.stack ? routesIn(layer.handle.stack) : [];
  });

describe('tenant isolation coverage', () => {
  it('has a case for every /workspaces/*, /invites/*, /boards/*, /lists/*, /cards/*, /labels/*, /checklists/* and /comments/* route in the app', () => {
    const appRouter = (createTestApp() as unknown as { router: { stack: Layer[] } }).router;
    const registered = routesIn(appRouter.stack).filter((route) =>
      /^[A-Z]+ \/(workspaces|invites|boards|lists|cards|labels|checklists|comments)(\/|$)/.test(
        route,
      ),
    );
    const covered = new Set(cases.map((c) => c.route));

    expect(registered.length).toBeGreaterThan(0);
    expect(registered.filter((route) => !covered.has(route))).toEqual([]);
    expect([...covered].filter((route) => !registered.includes(route))).toEqual([]);
  });
});
