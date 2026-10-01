import { BoardDetailDtoSchema, CardDetailDtoSchema } from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { cardData } from '../data/cards';
import { paths } from '../data/http';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Role } from '@trello-clone/shared';
import type { Express } from 'express';

// CARD-005b: docs/api/cards.md → Card members & labels, and invariant I3. The role matrix and
// tenant isolation of these routes run in their own suites.

type User = Awaited<ReturnType<typeof createUserWithToken>>;

let app: Express;

beforeAll(() => {
  app = createTestApp();
});
beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
  await testPrisma.$disconnect();
});

/** A user added to `workspaceId` with `role`. */
async function memberOf(workspaceId: string, role: Role = 'MEMBER') {
  const user = await createUserWithToken();
  await testPrisma.workspaceMember.create({
    data: { userId: user.user.id, workspaceId, role },
  });
  return user;
}

/** A workspace of a new owner with a board, a list and a card, plus a second member. */
async function workspace() {
  const owner = await createUserWithToken();
  const created = await request(app)
    .post(paths.workspaces)
    .set(bearer(owner.token))
    .send({ name: cardData.workspaceName })
    .expect(201);
  const workspaceId = created.body.data.id as string;
  const board = await request(app)
    .post(`${paths.workspaces}/${workspaceId}/boards`)
    .set(bearer(owner.token))
    .send({ title: cardData.boardTitle })
    .expect(201);
  const boardId = board.body.data.id as string;
  const list = await request(app)
    .post(`${paths.boards}/${boardId}/lists`)
    .set(bearer(owner.token))
    .send({ title: cardData.listTitle })
    .expect(201);
  const card = await request(app)
    .post(`${paths.lists}/${list.body.data.id as string}/cards`)
    .set(bearer(owner.token))
    .send({ title: cardData.titles[0] })
    .expect(201);
  const teammate = await memberOf(workspaceId);
  return { owner, teammate, workspaceId, boardId, cardId: card.body.data.id as string };
}

const memberPath = (cardId: string, userId: string) => `${paths.cards}/${cardId}/members/${userId}`;

const cardDetail = async (cardId: string, user: User) =>
  CardDetailDtoSchema.parse(
    (await request(app).get(`${paths.cards}/${cardId}`).set(bearer(user.token)).expect(200)).body
      .data,
  );

const activitiesOf = (cardId: string) =>
  testPrisma.activity.findMany({
    where: { cardId, type: { in: ['MEMBER_ADDED', 'MEMBER_REMOVED'] } },
    orderBy: { id: 'asc' },
    select: { type: true, data: true, userId: true },
  });

describe('POST /api/v1/cards/:cardId/members/:userId', () => {
  it('204: assigns once (idempotent); the card, the tile and the activity log show it', async () => {
    const { owner, teammate, boardId, cardId } = await workspace();

    for (let i = 0; i < 2; i += 1) {
      await request(app)
        .post(memberPath(cardId, teammate.user.id))
        .set(bearer(owner.token))
        .expect(204);
    }

    expect((await cardDetail(cardId, owner)).members).toEqual([
      { id: teammate.user.id, name: teammate.user.name, avatarUrl: null },
    ]);
    const board = BoardDetailDtoSchema.parse(
      (await request(app).get(`${paths.boards}/${boardId}`).set(bearer(owner.token))).body.data,
    );
    expect(board.lists[0]!.cards[0]!.memberIds).toEqual([teammate.user.id]);
    expect(await activitiesOf(cardId)).toEqual([
      { type: 'MEMBER_ADDED', data: { userId: teammate.user.id }, userId: owner.user.id },
    ]);
  });

  it('a VIEWER of the workspace can be assigned', async () => {
    const { owner, workspaceId, cardId } = await workspace();
    const viewer = await memberOf(workspaceId, 'VIEWER');

    await request(app)
      .post(memberPath(cardId, viewer.user.id))
      .set(bearer(owner.token))
      .expect(204);
  });

  it.each([
    { case: 'a user outside the workspace', outsider: true },
    { case: 'a user id nothing has', outsider: false },
  ])('422 NOT_WORKSPACE_MEMBER for $case; nothing is assigned', async ({ outsider }) => {
    const { owner, cardId } = await workspace();
    const userId = outsider ? (await createUserWithToken()).user.id : cardData.unknownCardId;

    const res = await request(app).post(memberPath(cardId, userId)).set(bearer(owner.token));

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].rule).toBe('NOT_WORKSPACE_MEMBER');
    expect(await testPrisma.cardMember.count({ where: { cardId } })).toBe(0);
  });

  it('404 for a card id nothing has', async () => {
    const { owner, teammate } = await workspace();

    const res = await request(app)
      .post(memberPath(cardData.unknownCardId, teammate.user.id))
      .set(bearer(owner.token));

    expect(res.status).toBe(404);
  });

  it('401 without a token', async () => {
    const { teammate, cardId } = await workspace();

    expect((await request(app).post(memberPath(cardId, teammate.user.id))).status).toBe(401);
    expect((await request(app).delete(memberPath(cardId, teammate.user.id))).status).toBe(401);
  });
});

describe('DELETE /api/v1/cards/:cardId/members/:userId', () => {
  it('204: unassigns (idempotent), logging MEMBER_REMOVED once', async () => {
    const { owner, teammate, cardId } = await workspace();
    await request(app).post(memberPath(cardId, teammate.user.id)).set(bearer(owner.token));

    for (let i = 0; i < 2; i += 1) {
      await request(app)
        .delete(memberPath(cardId, teammate.user.id))
        .set(bearer(owner.token))
        .expect(204);
    }

    expect((await cardDetail(cardId, owner)).members).toEqual([]);
    expect((await activitiesOf(cardId)).map((activity) => activity.type)).toEqual([
      'MEMBER_ADDED',
      'MEMBER_REMOVED',
    ]);
  });
});

describe('leaving or being removed from the workspace (I3)', () => {
  it("removes the member's card assignments in that workspace only", async () => {
    const { owner, teammate, workspaceId, cardId } = await workspace();
    const other = await workspace();
    await testPrisma.workspaceMember.create({
      data: { userId: teammate.user.id, workspaceId: other.workspaceId, role: 'MEMBER' },
    });
    await request(app).post(memberPath(cardId, teammate.user.id)).set(bearer(owner.token));
    await request(app)
      .post(memberPath(other.cardId, teammate.user.id))
      .set(bearer(other.owner.token))
      .expect(204);

    await request(app)
      .delete(`${paths.workspaces}/${workspaceId}/members/${teammate.user.id}`)
      .set(bearer(owner.token))
      .expect(204);

    expect(await testPrisma.cardMember.count({ where: { cardId } })).toBe(0);
    expect(await testPrisma.cardMember.count({ where: { cardId: other.cardId } })).toBe(1);
  });

  it('a removal racing an assignment waits for it, then removes the assignment too', async () => {
    const { owner, teammate, workspaceId, cardId } = await workspace();
    let removal: Promise<request.Response> | undefined;

    // The assignment holds the membership row and inserts (as cards.service.assignMember does).
    await testPrisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "userId" FROM "WorkspaceMember"
          WHERE "userId" = ${teammate.user.id} AND "workspaceId" = ${workspaceId} FOR KEY SHARE`;
        await tx.cardMember.create({ data: { cardId, userId: teammate.user.id } });
        removal = request(app)
          .delete(`${paths.workspaces}/${workspaceId}/members/${teammate.user.id}`)
          .set(bearer(owner.token))
          .then((res) => res);
        await Promise.race([waitForLockWait(), removal]);
      },
      { timeout: 20_000 },
    );

    expect((await removal!).status).toBe(204);
    expect(await testPrisma.cardMember.count({ where: { cardId } })).toBe(0);
  });

  it('an assignment racing the removal waits for it, then is refused', async () => {
    const { owner, teammate, workspaceId, cardId } = await workspace();
    let assign: Promise<request.Response> | undefined;

    // The removal holds the membership row (as workspaces.service.removeMember does).
    await testPrisma.$transaction(
      async (tx) => {
        await tx.workspaceMember.delete({
          where: { userId_workspaceId: { userId: teammate.user.id, workspaceId } },
        });
        assign = request(app)
          .post(memberPath(cardId, teammate.user.id))
          .set(bearer(owner.token))
          .then((res) => res);
        // Without the lock the assignment would not wait, and answers before the removal commits.
        await Promise.race([waitForLockWait(), assign]);
      },
      { timeout: 20_000 },
    );

    const res = await assign!;
    expect(res.status).toBe(422);
    expect(await testPrisma.cardMember.count({ where: { cardId } })).toBe(0);
  });
});

/** Resolves once some query waits on a row lock. */
async function waitForLockWait() {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const [row] = await testPrisma.$queryRaw<{ waiting: bigint }[]>`
      SELECT count(*) AS waiting FROM pg_stat_activity WHERE wait_event_type = 'Lock'`;
    if (row && row.waiting > 0n) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Nothing ever waited on a row lock');
}
