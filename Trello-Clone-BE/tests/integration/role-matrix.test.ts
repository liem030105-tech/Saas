import request from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { boardData } from '../data/boards';
import { cardData } from '../data/cards';
import { paths } from '../data/http';
import { labelData } from '../data/labels';
import { listData } from '../data/lists';
import { roleMatrixData } from '../data/workspaces';
import { resetDb, testPrisma } from '../helpers/db';
import { describeRoleMatrix, type MatrixContext } from '../helpers/role-matrix';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Express } from 'express';

// Every workspace-scoped endpoint against the permission matrix (docs/api/README.md), through
// the role-matrix harness (WORKSPACE-005). Rule details (LAST_OWNER, targets, invites) are covered
// in the per-module files.

let app: Express;
const getApp = () => app;

beforeAll(() => {
  app = createTestApp();
});
beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
  await testPrisma.$disconnect();
});

const workspacePath = ({ workspaceId }: MatrixContext) => `${paths.workspaces}/${workspaceId}`;
const as = (ctx: MatrixContext) => bearer(ctx.caller.token);

/** A plain MEMBER the owner can act on. */
async function addTargetMember({ workspaceId }: { workspaceId: string }) {
  const target = await createUserWithToken();
  await testPrisma.workspaceMember.create({
    data: { userId: target.user.id, workspaceId, role: 'MEMBER' },
  });
  return { targetId: target.user.id };
}

describeRoleMatrix(getApp, {
  name: 'GET /workspaces/:workspaceId',
  request: (ctx) => request(ctx.app).get(workspacePath(ctx)).set(as(ctx)),
  expected: { OWNER: 200, ADMIN: 200, MEMBER: 200, VIEWER: 200, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'PATCH /workspaces/:workspaceId',
  request: (ctx) =>
    request(ctx.app).patch(workspacePath(ctx)).set(as(ctx)).send(roleMatrixData.rename),
  expected: { OWNER: 200, ADMIN: 200, MEMBER: 403, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'DELETE /workspaces/:workspaceId',
  request: (ctx) => request(ctx.app).delete(workspacePath(ctx)).set(as(ctx)),
  expected: { OWNER: 204, ADMIN: 403, MEMBER: 403, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'GET /workspaces/:workspaceId/members',
  request: (ctx) =>
    request(ctx.app)
      .get(`${workspacePath(ctx)}/members`)
      .set(as(ctx)),
  expected: { OWNER: 200, ADMIN: 200, MEMBER: 200, VIEWER: 200, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'PATCH /workspaces/:workspaceId/members/:userId',
  setup: addTargetMember,
  request: (ctx) =>
    request(ctx.app)
      .patch(`${workspacePath(ctx)}/members/${ctx.fixture.targetId}`)
      .set(as(ctx))
      .send(roleMatrixData.roleChange),
  expected: { OWNER: 200, ADMIN: 200, MEMBER: 403, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'DELETE /workspaces/:workspaceId/members/:userId (remove someone)',
  setup: addTargetMember,
  request: (ctx) =>
    request(ctx.app)
      .delete(`${workspacePath(ctx)}/members/${ctx.fixture.targetId}`)
      .set(as(ctx)),
  expected: { OWNER: 204, ADMIN: 204, MEMBER: 403, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'DELETE /workspaces/:workspaceId/members/:userId (leave)',
  request: (ctx) =>
    request(ctx.app)
      .delete(`${workspacePath(ctx)}/members/${ctx.caller.user.id}`)
      .set(as(ctx)),
  // The only OWNER cannot leave (footnote 1); a non-member is not in the workspace to leave.
  expected: { OWNER: 422, ADMIN: 204, MEMBER: 204, VIEWER: 204, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'GET /workspaces/:workspaceId/invites',
  request: (ctx) =>
    request(ctx.app)
      .get(`${workspacePath(ctx)}/invites`)
      .set(as(ctx)),
  expected: { OWNER: 200, ADMIN: 200, MEMBER: 403, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'POST /workspaces/:workspaceId/invites',
  request: (ctx) =>
    request(ctx.app)
      .post(`${workspacePath(ctx)}/invites`)
      .set(as(ctx))
      .send(roleMatrixData.invite),
  expected: { OWNER: 201, ADMIN: 201, MEMBER: 403, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'DELETE /workspaces/:workspaceId/invites/:inviteId',
  setup: async ({ app: server, workspaceId, owner }) => {
    const res = await request(server)
      .post(`${paths.workspaces}/${workspaceId}/invites`)
      .set(bearer(owner.token))
      .send(roleMatrixData.invite)
      .expect(201);
    return { inviteId: res.body.data.id as string };
  },
  request: (ctx) =>
    request(ctx.app)
      .delete(`${workspacePath(ctx)}/invites/${ctx.fixture.inviteId}`)
      .set(as(ctx)),
  expected: { OWNER: 204, ADMIN: 204, MEMBER: 403, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'GET /workspaces/:workspaceId/boards',
  request: (ctx) =>
    request(ctx.app)
      .get(`${workspacePath(ctx)}/boards`)
      .set(as(ctx)),
  expected: { OWNER: 200, ADMIN: 200, MEMBER: 200, VIEWER: 200, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'POST /workspaces/:workspaceId/boards',
  request: (ctx) =>
    request(ctx.app)
      .post(`${workspacePath(ctx)}/boards`)
      .set(as(ctx))
      .send({ title: boardData.tenantBoard.a }),
  expected: { OWNER: 201, ADMIN: 201, MEMBER: 201, VIEWER: 403, NON_MEMBER: 404 },
});

/** A board created by the workspace OWNER. */
async function addBoard({
  app: server,
  workspaceId,
  owner,
}: Omit<MatrixContext, 'caller' | 'fixture'>) {
  const res = await request(server)
    .post(`${paths.workspaces}/${workspaceId}/boards`)
    .set(bearer(owner.token))
    .send({ title: boardData.tenantBoard.a })
    .expect(201);
  return { boardId: res.body.data.id as string };
}

const boardPath = (ctx: MatrixContext) => `${paths.boards}/${ctx.fixture.boardId}`;

describeRoleMatrix(getApp, {
  name: 'GET /boards/:boardId',
  setup: addBoard,
  request: (ctx) => request(ctx.app).get(boardPath(ctx)).set(as(ctx)),
  expected: { OWNER: 200, ADMIN: 200, MEMBER: 200, VIEWER: 200, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'PATCH /boards/:boardId',
  setup: addBoard,
  request: (ctx) =>
    request(ctx.app).patch(boardPath(ctx)).set(as(ctx)).send({ title: boardData.tenantBoard.b }),
  expected: { OWNER: 200, ADMIN: 200, MEMBER: 200, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'DELETE /boards/:boardId',
  setup: addBoard,
  request: (ctx) => request(ctx.app).delete(boardPath(ctx)).set(as(ctx)),
  expected: { OWNER: 204, ADMIN: 204, MEMBER: 403, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'POST /boards/:boardId/lists',
  setup: addBoard,
  request: (ctx) =>
    request(ctx.app)
      .post(`${boardPath(ctx)}/lists`)
      .set(as(ctx))
      .send({ title: listData.tenantList.a }),
  expected: { OWNER: 201, ADMIN: 201, MEMBER: 201, VIEWER: 403, NON_MEMBER: 404 },
});

/** A board with one list, both created by the workspace OWNER. */
async function addList(ctx: Omit<MatrixContext, 'caller' | 'fixture'>) {
  const { boardId } = await addBoard(ctx);
  const res = await request(ctx.app)
    .post(`${paths.boards}/${boardId}/lists`)
    .set(bearer(ctx.owner.token))
    .send({ title: listData.tenantList.a })
    .expect(201);
  return { boardId, listId: res.body.data.id as string };
}

const listPath = (ctx: MatrixContext) => `${paths.lists}/${ctx.fixture.listId}`;

describeRoleMatrix(getApp, {
  name: 'PATCH /lists/:listId',
  setup: addList,
  request: (ctx) =>
    request(ctx.app).patch(listPath(ctx)).set(as(ctx)).send({ title: listData.tenantList.b }),
  expected: { OWNER: 200, ADMIN: 200, MEMBER: 200, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'DELETE /lists/:listId',
  setup: addList,
  request: (ctx) => request(ctx.app).delete(listPath(ctx)).set(as(ctx)),
  expected: { OWNER: 204, ADMIN: 204, MEMBER: 204, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'POST /lists/:listId/cards',
  setup: addList,
  request: (ctx) =>
    request(ctx.app)
      .post(`${listPath(ctx)}/cards`)
      .set(as(ctx))
      .send({ title: cardData.tenantCard.a }),
  expected: { OWNER: 201, ADMIN: 201, MEMBER: 201, VIEWER: 403, NON_MEMBER: 404 },
});

/** A board with one list holding one card, all created by the workspace OWNER. */
async function addCard(ctx: Omit<MatrixContext, 'caller' | 'fixture'>) {
  const { boardId, listId } = await addList(ctx);
  const res = await request(ctx.app)
    .post(`${paths.lists}/${listId}/cards`)
    .set(bearer(ctx.owner.token))
    .send({ title: cardData.tenantCard.a })
    .expect(201);
  return { boardId, listId, cardId: res.body.data.id as string };
}

const cardPath = (ctx: MatrixContext) => `${paths.cards}/${ctx.fixture.cardId}`;

describeRoleMatrix(getApp, {
  name: 'GET /cards/:cardId',
  setup: addCard,
  request: (ctx) => request(ctx.app).get(cardPath(ctx)).set(as(ctx)),
  expected: { OWNER: 200, ADMIN: 200, MEMBER: 200, VIEWER: 200, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'PATCH /cards/:cardId',
  setup: addCard,
  request: (ctx) =>
    request(ctx.app).patch(cardPath(ctx)).set(as(ctx)).send({ title: cardData.tenantCard.b }),
  expected: { OWNER: 200, ADMIN: 200, MEMBER: 200, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'DELETE /cards/:cardId',
  setup: addCard,
  request: (ctx) => request(ctx.app).delete(cardPath(ctx)).set(as(ctx)),
  expected: { OWNER: 204, ADMIN: 204, MEMBER: 204, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'PATCH /cards/:cardId/move',
  setup: addCard,
  request: (ctx) =>
    request(ctx.app)
      .patch(`${cardPath(ctx)}/move`)
      .set(as(ctx))
      .send({ listId: ctx.fixture.listId, position: 512 }),
  expected: { OWNER: 200, ADMIN: 200, MEMBER: 200, VIEWER: 403, NON_MEMBER: 404 },
});

// Labels (CARD-005).

/** A board (with its default labels) holding one card; `labelId` is the board's first label. */
async function addLabelledCard(ctx: Omit<MatrixContext, 'caller' | 'fixture'>) {
  const fixture = await addCard(ctx);
  const label = await testPrisma.label.findFirstOrThrow({ where: { boardId: fixture.boardId } });
  return { ...fixture, labelId: label.id };
}

const labelPath = (ctx: MatrixContext) => `${paths.labels}/${ctx.fixture.labelId}`;
const cardLabelPath = (ctx: MatrixContext) => `${cardPath(ctx)}/labels/${ctx.fixture.labelId}`;

describeRoleMatrix(getApp, {
  name: 'GET /boards/:boardId/labels',
  setup: addBoard,
  request: (ctx) =>
    request(ctx.app)
      .get(`${boardPath(ctx)}/labels`)
      .set(as(ctx)),
  expected: { OWNER: 200, ADMIN: 200, MEMBER: 200, VIEWER: 200, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'POST /boards/:boardId/labels',
  setup: addBoard,
  request: (ctx) =>
    request(ctx.app)
      .post(`${boardPath(ctx)}/labels`)
      .set(as(ctx))
      .send(labelData.create.input),
  expected: { OWNER: 201, ADMIN: 201, MEMBER: 201, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'PATCH /labels/:labelId',
  setup: addLabelledCard,
  request: (ctx) => request(ctx.app).patch(labelPath(ctx)).set(as(ctx)).send({ name: 'Bug' }),
  expected: { OWNER: 200, ADMIN: 200, MEMBER: 200, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'DELETE /labels/:labelId',
  setup: addLabelledCard,
  request: (ctx) => request(ctx.app).delete(labelPath(ctx)).set(as(ctx)),
  expected: { OWNER: 204, ADMIN: 204, MEMBER: 204, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'POST /cards/:cardId/labels/:labelId',
  setup: addLabelledCard,
  request: (ctx) => request(ctx.app).post(cardLabelPath(ctx)).set(as(ctx)),
  expected: { OWNER: 204, ADMIN: 204, MEMBER: 204, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'DELETE /cards/:cardId/labels/:labelId',
  setup: addLabelledCard,
  request: (ctx) => request(ctx.app).delete(cardLabelPath(ctx)).set(as(ctx)),
  expected: { OWNER: 204, ADMIN: 204, MEMBER: 204, VIEWER: 403, NON_MEMBER: 404 },
});

// Card members (CARD-005b): the workspace OWNER is assigned (always a member of the workspace).
const cardMemberPath = (ctx: MatrixContext) => `${cardPath(ctx)}/members/${ctx.owner.user.id}`;

describeRoleMatrix(getApp, {
  name: 'POST /cards/:cardId/members/:userId',
  setup: addCard,
  request: (ctx) => request(ctx.app).post(cardMemberPath(ctx)).set(as(ctx)),
  expected: { OWNER: 204, ADMIN: 204, MEMBER: 204, VIEWER: 403, NON_MEMBER: 404 },
});

describeRoleMatrix(getApp, {
  name: 'DELETE /cards/:cardId/members/:userId',
  setup: addCard,
  request: (ctx) => request(ctx.app).delete(cardMemberPath(ctx)).set(as(ctx)),
  expected: { OWNER: 204, ADMIN: 204, MEMBER: 204, VIEWER: 403, NON_MEMBER: 404 },
});
