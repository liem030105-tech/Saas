import { BoardDetailDtoSchema, BoardDtoSchema, ErrorResponseSchema } from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { assertBoardAccess } from '../../src/modules/boards/boards.service';
import { boardData, invalidBoardBodies, invalidBoardUpdates } from '../data/boards';
import { paths } from '../data/http';
import { unknownWorkspaceId } from '../data/workspaces';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Role } from '@trello-clone/shared';
import type { Express } from 'express';

// BOARD-001: docs/api/boards.md. The full role matrix and tenant isolation run in their own
// suites (role-matrix.test.ts, tenant-isolation.test.ts).

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

const boardsPath = (workspaceId: string) => `${paths.workspaces}/${workspaceId}/boards`;

async function workspaceOf(owner: User) {
  const res = await request(app)
    .post(paths.workspaces)
    .set(bearer(owner.token))
    .send({ name: boardData.workspaceName })
    .expect(201);
  return res.body.data.id as string;
}

async function memberOf(workspaceId: string, role: Role) {
  const user = await createUserWithToken();
  await testPrisma.workspaceMember.create({ data: { userId: user.user.id, workspaceId, role } });
  return user;
}

const createBoard = (workspaceId: string, user: User, body: object) =>
  request(app).post(boardsPath(workspaceId)).set(bearer(user.token)).send(body);

describe('POST /api/v1/workspaces/:workspaceId/boards', () => {
  it('201: a MEMBER creates a board, and BOARD_CREATED is logged with them as the actor', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    const member = await memberOf(workspaceId, 'MEMBER');

    const res = await createBoard(workspaceId, member, boardData.create.input);

    expect(res.status).toBe(201);
    const board = BoardDtoSchema.parse(res.body.data);
    expect(board).toMatchObject({
      workspaceId,
      title: boardData.create.stored,
      background: boardData.create.input.background,
      archived: false,
    });
    const activities = await testPrisma.activity.findMany({ where: { boardId: board.id } });
    expect(activities).toEqual([
      expect.objectContaining({
        type: 'BOARD_CREATED',
        userId: member.user.id,
        data: { title: boardData.create.stored },
      }),
    ]);
  });

  it('uses the default background when none is sent', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);

    const res = await createBoard(workspaceId, owner, { title: boardData.titles[0] });

    expect(res.body.data.background).toBe(boardData.defaultBackground);
  });

  it.each(invalidBoardBodies)('400 for $case, nothing created', async ({ body }) => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);

    const res = await createBoard(workspaceId, owner, body);

    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    expect(await testPrisma.board.count()).toBe(0);
  });

  it('403 for a VIEWER, nothing created', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    const viewer = await memberOf(workspaceId, 'VIEWER');

    const res = await createBoard(workspaceId, viewer, { title: boardData.titles[0] });

    expect(res.status).toBe(403);
    expect(await testPrisma.board.count()).toBe(0);
  });

  it('404 for a non-member or an unknown workspace', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    const outsider = await createUserWithToken();

    for (const id of [workspaceId, unknownWorkspaceId]) {
      const res = await createBoard(id, outsider, { title: boardData.titles[0] });
      expect(res.status).toBe(404);
    }
  });

  it('401 without a token', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);

    const res = await request(app).post(boardsPath(workspaceId)).send(boardData.anyBody);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/workspaces/:workspaceId/boards', () => {
  it('200 for a VIEWER: the open boards, newest first', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    for (const title of boardData.titles) await createBoard(workspaceId, owner, { title });
    const archived = await createBoard(workspaceId, owner, { title: boardData.archivedTitle });
    await testPrisma.board.update({
      where: { id: archived.body.data.id },
      data: { archived: true },
    });
    const viewer = await memberOf(workspaceId, 'VIEWER');

    const res = await request(app).get(boardsPath(workspaceId)).set(bearer(viewer.token));

    expect(res.status).toBe(200);
    const boards = BoardDtoSchema.array().parse(res.body.data);
    expect(boards.map((b) => b.title)).toEqual([...boardData.titles].reverse());
  });

  it('archived=true lists only the archived boards', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    await createBoard(workspaceId, owner, { title: boardData.titles[0] });
    const archived = await createBoard(workspaceId, owner, { title: boardData.archivedTitle });
    await testPrisma.board.update({
      where: { id: archived.body.data.id },
      data: { archived: true },
    });

    const res = await request(app)
      .get(`${boardsPath(workspaceId)}?archived=true`)
      .set(bearer(owner.token));

    expect(res.body.data.map((b: { title: string }) => b.title)).toEqual([boardData.archivedTitle]);
  });

  it('400 for an invalid archived filter', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);

    const res = await request(app)
      .get(`${boardsPath(workspaceId)}?${boardData.invalidArchivedQuery}`)
      .set(bearer(owner.token));

    expect(res.status).toBe(400);
  });

  it('404 for a non-member', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    const outsider = await createUserWithToken();

    const res = await request(app).get(boardsPath(workspaceId)).set(bearer(outsider.token));

    expect(res.status).toBe(404);
  });

  it('401 without a token', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);

    expect((await request(app).get(boardsPath(workspaceId))).status).toBe(401);
  });
});

describe('assertBoardAccess', () => {
  async function boardWith(role: Role) {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    const board = await createBoard(workspaceId, owner, { title: boardData.titles[0] });
    const member = role === 'OWNER' ? owner : await memberOf(workspaceId, role);
    return { boardId: board.body.data.id as string, workspaceId, member };
  }

  it("returns the board (with its stored workspace) and the caller's role", async () => {
    const { boardId, workspaceId, member } = await boardWith('VIEWER');

    await expect(assertBoardAccess(member.user.id, boardId, 'board.view')).resolves.toEqual({
      board: { id: boardId, workspaceId },
      role: 'VIEWER',
    });
  });

  it('403 when the role does not allow the action', async () => {
    const { boardId, member } = await boardWith('VIEWER');

    await expect(assertBoardAccess(member.user.id, boardId, 'board.edit')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('404 for a non-member and for an unknown board', async () => {
    const { boardId } = await boardWith('OWNER');
    const outsider = await createUserWithToken();

    for (const id of [boardId, boardData.unknownBoardId]) {
      await expect(assertBoardAccess(outsider.user.id, id, 'board.view')).rejects.toMatchObject({
        status: 404,
      });
    }
  });
});

describe('/api/v1/boards/:boardId', () => {
  const boardPath = (boardId: string) => `${paths.boards}/${boardId}`;

  /** A board created by its workspace OWNER, plus a member with `role` (the owner for OWNER). */
  async function boardWith(role: Role) {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    const created = await createBoard(workspaceId, owner, { title: boardData.titles[0] });
    const member = role === 'OWNER' ? owner : await memberOf(workspaceId, role);
    return { boardId: created.body.data.id as string, workspaceId, owner, member };
  }

  describe('GET', () => {
    it('200 for a VIEWER: the board, with (for now) no lists or labels', async () => {
      const { boardId, workspaceId, member } = await boardWith('VIEWER');

      const res = await request(app).get(boardPath(boardId)).set(bearer(member.token));

      expect(res.status).toBe(200);
      expect(BoardDetailDtoSchema.parse(res.body.data)).toMatchObject({
        id: boardId,
        workspaceId,
        title: boardData.titles[0],
        lists: [],
        labels: [],
      });
    });

    it('an archived board stays viewable', async () => {
      const { boardId, member } = await boardWith('VIEWER');
      await testPrisma.board.update({ where: { id: boardId }, data: { archived: true } });

      const res = await request(app).get(boardPath(boardId)).set(bearer(member.token));

      expect(res.status).toBe(200);
      expect(res.body.data.archived).toBe(true);
    });

    it('404 for a non-member and for an unknown board', async () => {
      const { boardId } = await boardWith('OWNER');
      const outsider = await createUserWithToken();

      for (const id of [boardId, boardData.unknownBoardId]) {
        expect((await request(app).get(boardPath(id)).set(bearer(outsider.token))).status).toBe(
          404,
        );
      }
    });

    it('401 without a token', async () => {
      const { boardId } = await boardWith('OWNER');

      expect((await request(app).get(boardPath(boardId))).status).toBe(401);
    });
  });

  describe('PATCH', () => {
    const patch = (boardId: string, user: User, body: object) =>
      request(app).patch(boardPath(boardId)).set(bearer(user.token)).send(body);

    it('200 for a MEMBER: rename and recolour; BOARD_UPDATED logs the changes', async () => {
      const { boardId, member } = await boardWith('MEMBER');

      const res = await patch(boardId, member, boardData.update.input);

      expect(res.status).toBe(200);
      expect(BoardDtoSchema.parse(res.body.data)).toMatchObject({
        title: boardData.update.storedTitle,
        background: boardData.update.input.background,
      });
      const logged = await testPrisma.activity.findFirstOrThrow({
        where: { boardId, type: 'BOARD_UPDATED' },
      });
      expect(logged).toMatchObject({
        userId: member.user.id,
        data: {
          title: boardData.update.storedTitle,
          background: boardData.update.input.background,
        },
      });
    });

    it('archive round trip: leaves the open list, shows under archived, and comes back', async () => {
      const { boardId, workspaceId, member } = await boardWith('MEMBER');
      const list = (archived: boolean) =>
        request(app)
          .get(`${boardsPath(workspaceId)}?archived=${archived}`)
          .set(bearer(member.token));
      const ids = (res: request.Response) => res.body.data.map((b: { id: string }) => b.id);

      await patch(boardId, member, { archived: true }).expect(200);
      expect(ids(await list(false))).not.toContain(boardId);
      expect(ids(await list(true))).toContain(boardId);

      await patch(boardId, member, { archived: false }).expect(200);
      expect(ids(await list(false))).toContain(boardId);
      expect(ids(await list(true))).not.toContain(boardId);
    });

    it.each(invalidBoardUpdates)('400 for $case', async ({ body }) => {
      const { boardId, owner } = await boardWith('OWNER');

      const res = await patch(boardId, owner, body);

      expect(res.status).toBe(400);
      expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    });

    it('403 for a VIEWER, nothing changes', async () => {
      const { boardId, member } = await boardWith('VIEWER');

      expect((await patch(boardId, member, boardData.update.input)).status).toBe(403);
      const stored = await testPrisma.board.findUniqueOrThrow({ where: { id: boardId } });
      expect(stored.title).toBe(boardData.titles[0]);
    });

    it('404 for a non-member', async () => {
      const { boardId } = await boardWith('OWNER');
      const outsider = await createUserWithToken();

      expect((await patch(boardId, outsider, boardData.update.input)).status).toBe(404);
    });

    it('401 without a token', async () => {
      const { boardId } = await boardWith('OWNER');

      const res = await request(app).patch(boardPath(boardId)).send(boardData.update.input);

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE', () => {
    const remove = (boardId: string, user: User) =>
      request(app).delete(boardPath(boardId)).set(bearer(user.token));

    it('204 for an ADMIN: the board and its activity log are gone', async () => {
      const { boardId, member } = await boardWith('ADMIN');

      expect((await remove(boardId, member)).status).toBe(204);
      expect(await testPrisma.board.count({ where: { id: boardId } })).toBe(0);
      expect(await testPrisma.activity.count({ where: { boardId } })).toBe(0);
    });

    it.each(['MEMBER', 'VIEWER'] as const)('403 for a %s, nothing deleted', async (role) => {
      const { boardId, member } = await boardWith(role);

      expect((await remove(boardId, member)).status).toBe(403);
      expect(await testPrisma.board.count({ where: { id: boardId } })).toBe(1);
    });

    it('404 for a non-member', async () => {
      const { boardId } = await boardWith('OWNER');
      const outsider = await createUserWithToken();

      expect((await remove(boardId, outsider)).status).toBe(404);
      expect(await testPrisma.board.count({ where: { id: boardId } })).toBe(1);
    });

    it('401 without a token', async () => {
      const { boardId } = await boardWith('OWNER');

      expect((await request(app).delete(boardPath(boardId))).status).toBe(401);
    });
  });
});
