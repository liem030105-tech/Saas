import { BoardDetailDtoSchema, ErrorResponseSchema, ListDtoSchema } from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { boardData } from '../data/boards';
import { paths } from '../data/http';
import { invalidListBodies, invalidListUpdates, listData } from '../data/lists';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Role } from '@trello-clone/shared';
import type { Express } from 'express';

// LIST-001, LIST-002: docs/api/lists.md. The full role matrix and tenant isolation run in their own suites
// (role-matrix.test.ts, tenant-isolation.test.ts).

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

const listsPath = (boardId: string) => `${paths.boards}/${boardId}/lists`;

/** A board in a fresh workspace owned by a new user, plus a member with `role` if given. */
async function boardWith(role?: Role) {
  const owner = await createUserWithToken();
  const workspace = await request(app)
    .post(paths.workspaces)
    .set(bearer(owner.token))
    .send({ name: listData.workspaceName })
    .expect(201);
  const workspaceId = workspace.body.data.id as string;
  const board = await request(app)
    .post(`${paths.workspaces}/${workspaceId}/boards`)
    .set(bearer(owner.token))
    .send({ title: listData.boardTitle })
    .expect(201);
  let member: User | undefined;
  if (role) {
    member = await createUserWithToken();
    await testPrisma.workspaceMember.create({
      data: { userId: member.user.id, workspaceId, role },
    });
  }
  return { owner, member: member ?? owner, boardId: board.body.data.id as string };
}

const createList = (boardId: string, user: User, body: object) =>
  request(app).post(listsPath(boardId)).set(bearer(user.token)).send(body);

const detailOf = async (boardId: string, user: User) =>
  BoardDetailDtoSchema.parse(
    (await request(app).get(`${paths.boards}/${boardId}`).set(bearer(user.token)).expect(200)).body
      .data,
  );

describe('POST /api/v1/boards/:boardId/lists', () => {
  it('201: a MEMBER adds the first list at 1024, and LIST_CREATED is logged', async () => {
    const { member, boardId } = await boardWith('MEMBER');

    const res = await createList(boardId, member, listData.create.input);

    expect(res.status).toBe(201);
    const list = ListDtoSchema.parse(res.body.data);
    expect(list).toMatchObject({
      boardId,
      title: listData.create.stored,
      position: 1024,
      archived: false,
    });
    const activity = await testPrisma.activity.findFirst({ where: { type: 'LIST_CREATED' } });
    expect(activity).toMatchObject({
      boardId,
      userId: member.user.id,
      data: { listId: list.id, title: listData.create.stored },
    });
  });

  it('appends without a position; the board shows the lists in creation order', async () => {
    const { owner, boardId } = await boardWith();

    const positions: number[] = [];
    for (const title of listData.titles) {
      positions.push((await createList(boardId, owner, { title }).expect(201)).body.data.position);
    }

    expect(positions).toEqual([1024, 2048, 3072]);
    const detail = await detailOf(boardId, owner);
    expect(detail.lists.map((list) => list.title)).toEqual(listData.titles);
    expect(detail.lists.every((list) => list.cards.length === 0)).toBe(true);
  });

  it('stores a client position as sent, and the board sorts by it', async () => {
    const { owner, boardId } = await boardWith();
    await createList(boardId, owner, { title: listData.titles[0] }).expect(201);

    const res = await createList(boardId, owner, listData.explicit).expect(201);

    expect(res.body.data.position).toBe(listData.explicit.position);
    const detail = await detailOf(boardId, owner);
    expect(detail.lists.map((list) => list.title)).toEqual([
      listData.explicit.title,
      listData.titles[0],
    ]);
  });

  it('appends after archived lists too, and the board hides them', async () => {
    const { owner, boardId } = await boardWith();
    const archived = await createList(boardId, owner, { title: listData.archivedTitle }).expect(
      201,
    );
    await testPrisma.list.update({
      where: { id: archived.body.data.id },
      data: { archived: true },
    });

    const res = await createList(boardId, owner, { title: listData.titles[0] }).expect(201);

    expect(res.body.data.position).toBe(2048);
    const detail = await detailOf(boardId, owner);
    expect(detail.lists.map((list) => list.title)).toEqual([listData.titles[0]]);
  });

  it('breaks position ties by id, so the order is stable', async () => {
    const { owner, boardId } = await boardWith();
    for (const title of listData.titles) {
      await createList(boardId, owner, { title, position: 1024 }).expect(201);
    }

    const ids = (await testPrisma.list.findMany({ where: { boardId } })).map((list) => list.id);
    const detail = await detailOf(boardId, owner);
    expect(detail.lists.map((list) => list.id)).toEqual([...ids].sort());
  });

  it.each(invalidListBodies)('400: $case', async ({ body }) => {
    const { owner, boardId } = await boardWith();

    const res = await createList(boardId, owner, body);

    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    expect(await testPrisma.list.count()).toBe(0);
  });

  it('401 without a token', async () => {
    const { boardId } = await boardWith();

    const res = await request(app).post(listsPath(boardId)).send(listData.create.input);

    expect(res.status).toBe(401);
  });

  it('404 for a non-member, an unknown board and a malformed id', async () => {
    const { boardId } = await boardWith();
    const outsider = await createUserWithToken();

    for (const id of [boardId, boardData.unknownBoardId, boardData.malformedBoardId]) {
      expect((await createList(id, outsider, listData.create.input)).status).toBe(404);
    }
    expect(await testPrisma.list.count()).toBe(0);
  });

  it('403 for a VIEWER, and nothing is created', async () => {
    const { member, boardId } = await boardWith('VIEWER');

    const res = await createList(boardId, member, listData.create.input);

    expect(res.status).toBe(403);
    expect(await testPrisma.list.count()).toBe(0);
  });

  it('deleting the board deletes its lists', async () => {
    const { owner, boardId } = await boardWith();
    await createList(boardId, owner, listData.create.input).expect(201);

    await request(app).delete(`${paths.boards}/${boardId}`).set(bearer(owner.token)).expect(204);

    expect(await testPrisma.list.count()).toBe(0);
  });
});

/** A list on a fresh board (see boardWith), created by the board's owner. */
async function listWith(role?: Role) {
  const ctx = await boardWith(role);
  const res = await createList(ctx.boardId, ctx.owner, { title: listData.titles[0] }).expect(201);
  return { ...ctx, listId: res.body.data.id as string };
}

const listPath = (listId: string) => `${paths.lists}/${listId}`;
const patchList = (listId: string, user: User, body: object) =>
  request(app).patch(listPath(listId)).set(bearer(user.token)).send(body);
const deleteList = (listId: string, user: User) =>
  request(app).delete(listPath(listId)).set(bearer(user.token));
const activitiesOf = (type: 'LIST_UPDATED' | 'LIST_ARCHIVED') =>
  testPrisma.activity.findMany({ where: { type } });

describe('PATCH /api/v1/lists/:listId', () => {
  it('200: a MEMBER renames a list (trimmed), and LIST_UPDATED is logged', async () => {
    const { member, boardId, listId } = await listWith('MEMBER');

    const res = await patchList(listId, member, listData.rename.input);

    expect(res.status).toBe(200);
    expect(ListDtoSchema.parse(res.body.data)).toMatchObject({
      id: listId,
      title: listData.rename.stored,
      position: 1024,
      archived: false,
    });
    expect(await activitiesOf('LIST_UPDATED')).toEqual([
      expect.objectContaining({
        boardId,
        userId: member.user.id,
        data: { listId, title: listData.rename.stored },
      }),
    ]);
  });

  it('archiving logs LIST_ARCHIVED and hides the list; unarchiving puts it back in place', async () => {
    const { owner, boardId, listId } = await listWith();
    await createList(boardId, owner, { title: listData.titles[1] }).expect(201);

    const archived = await patchList(listId, owner, { archived: true }).expect(200);

    expect(archived.body.data).toMatchObject({ archived: true, position: 1024 });
    expect((await activitiesOf('LIST_ARCHIVED')).map((a) => a.data)).toEqual([
      { listId, archived: true },
    ]);
    expect((await detailOf(boardId, owner)).lists.map((list) => list.title)).toEqual([
      listData.titles[1],
    ]);

    await patchList(listId, owner, { archived: false }).expect(200);

    expect((await activitiesOf('LIST_UPDATED')).map((a) => a.data)).toEqual([
      { listId, archived: false },
    ]);
    expect((await detailOf(boardId, owner)).lists.map((list) => list.title)).toEqual([
      listData.titles[0],
      listData.titles[1],
    ]);
  });

  it.each(invalidListUpdates)('400: $case', async ({ body }) => {
    const { owner, listId } = await listWith();

    const res = await patchList(listId, owner, body);

    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('401 without a token', async () => {
    const { listId } = await listWith();

    expect((await request(app).patch(listPath(listId)).send(listData.rename.input)).status).toBe(
      401,
    );
  });

  it('404 for a non-member, an unknown list and a malformed id; nothing changes', async () => {
    const { listId } = await listWith();
    const outsider = await createUserWithToken();

    for (const id of [listId, listData.unknownListId, listData.malformedListId]) {
      expect((await patchList(id, outsider, listData.rename.input)).status).toBe(404);
    }
    expect(await testPrisma.list.findUnique({ where: { id: listId } })).toMatchObject({
      title: listData.titles[0],
    });
  });

  it('403 for a VIEWER, and nothing changes', async () => {
    const { member, listId } = await listWith('VIEWER');

    expect((await patchList(listId, member, { archived: true })).status).toBe(403);
    expect(await testPrisma.list.findUnique({ where: { id: listId } })).toMatchObject({
      archived: false,
    });
  });
});

describe('DELETE /api/v1/lists/:listId', () => {
  it('204: a MEMBER deletes a list; the board no longer shows it', async () => {
    const { member, owner, boardId, listId } = await listWith('MEMBER');

    const res = await deleteList(listId, member);

    expect(res.status).toBe(204);
    expect(await testPrisma.list.count()).toBe(0);
    expect((await detailOf(boardId, owner)).lists).toEqual([]);
  });

  it('401 without a token', async () => {
    const { listId } = await listWith();

    expect((await request(app).delete(listPath(listId))).status).toBe(401);
  });

  it('404 for a non-member, an unknown list and a malformed id; nothing is deleted', async () => {
    const { listId } = await listWith();
    const outsider = await createUserWithToken();

    for (const id of [listId, listData.unknownListId, listData.malformedListId]) {
      expect((await deleteList(id, outsider)).status).toBe(404);
    }
    expect(await testPrisma.list.count()).toBe(1);
  });

  it('403 for a VIEWER, and nothing is deleted', async () => {
    const { member, listId } = await listWith('VIEWER');

    expect((await deleteList(listId, member)).status).toBe(403);
    expect(await testPrisma.list.count()).toBe(1);
  });

  it('404 the second time', async () => {
    const { owner, listId } = await listWith();
    await deleteList(listId, owner).expect(204);

    expect((await deleteList(listId, owner)).status).toBe(404);
  });
});
