import { ROOM_EVENTS } from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { boardRoom, workspaceRoom } from '../../src/realtime/rooms';
import { boardData } from '../data/boards';
import { cardData } from '../data/cards';
import { paths } from '../data/http';
import { unknownWorkspaceId } from '../data/workspaces';
import { resetDb, testPrisma } from '../helpers/db';
import {
  clientFor,
  connected,
  roomRequest,
  startRealtime,
  type RealtimeHarness,
} from '../helpers/realtime';
import { createTestApp } from '../helpers/test-app';
import { buildRejectedTokens } from '../helpers/tokens';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Express } from 'express';
import type { Socket } from 'socket.io-client';

// REALTIME-001: docs/architecture/realtime.md → Connection and authorization. Events emitted by
// the services are covered with them.

let app: Express;
let harness: RealtimeHarness;
const sockets: Socket[] = [];

beforeAll(async () => {
  app = createTestApp();
  harness = await startRealtime(app);
});
beforeEach(resetDb);
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.disconnect();
});
afterAll(async () => {
  await harness.close();
  await prisma.$disconnect();
  await testPrisma.$disconnect();
});

const open = (auth: Record<string, unknown>) => {
  const socket = clientFor(harness.url, auth);
  sockets.push(socket);
  return socket;
};

/** A workspace with a board, owned by a new user. */
async function boardOfNewOwner() {
  const owner = await createUserWithToken();
  const ws = await request(app)
    .post(paths.workspaces)
    .set(bearer(owner.token))
    .send({ name: cardData.workspaceName })
    .expect(201);
  const workspaceId = ws.body.data.id as string;
  const board = await request(app)
    .post(`${paths.workspaces}/${workspaceId}/boards`)
    .set(bearer(owner.token))
    .send({ title: cardData.boardTitle })
    .expect(201);
  return { owner, workspaceId, boardId: board.body.data.id as string };
}

/** The user ids of the sockets in `room`. */
const inRoom = async (room: string) =>
  (await harness.io.in(room).fetchSockets()).map((s) => s.data.userId as string);

describe('handshake', () => {
  it('connects with a valid access token', async () => {
    const { owner } = await boardOfNewOwner();

    const socket = await connected(open({ token: owner.token }));

    expect(socket.connected).toBe(true);
  });

  it('refuses a missing token, a non-string one and every rejected token with UNAUTHORIZED', async () => {
    const { owner } = await boardOfNewOwner();
    const rejected = await buildRejectedTokens(owner.user.id);

    for (const auth of [
      {},
      { token: 42 },
      ...Object.values(rejected).map((token) => ({ token })),
    ]) {
      await expect(connected(open(auth))).rejects.toThrow('UNAUTHORIZED');
    }
  });
});

describe('rooms', () => {
  it('a member joins and leaves the board and workspace rooms (ack ok)', async () => {
    const { owner, workspaceId, boardId } = await boardOfNewOwner();
    const socket = await connected(open({ token: owner.token }));

    expect(await roomRequest(socket, ROOM_EVENTS.boardJoin, { boardId })).toEqual({ ok: true });
    expect(await roomRequest(socket, ROOM_EVENTS.workspaceJoin, { workspaceId })).toEqual({
      ok: true,
    });
    expect(await inRoom(boardRoom(boardId))).toEqual([owner.user.id]);
    expect(await inRoom(workspaceRoom(workspaceId))).toEqual([owner.user.id]);

    expect(await roomRequest(socket, ROOM_EVENTS.boardLeave, { boardId })).toEqual({ ok: true });
    expect(await roomRequest(socket, ROOM_EVENTS.workspaceLeave, { workspaceId })).toEqual({
      ok: true,
    });
    expect(await inRoom(boardRoom(boardId))).toEqual([]);
    expect(await inRoom(workspaceRoom(workspaceId))).toEqual([]);
  });

  it('a VIEWER may join (read access is enough)', async () => {
    const { workspaceId, boardId } = await boardOfNewOwner();
    const viewer = await createUserWithToken();
    await testPrisma.workspaceMember.create({
      data: { userId: viewer.user.id, workspaceId, role: 'VIEWER' },
    });
    const socket = await connected(open({ token: viewer.token }));

    expect(await roomRequest(socket, ROOM_EVENTS.boardJoin, { boardId })).toEqual({ ok: true });
  });

  it('a non-member, an unknown id and a missing board all answer NOT_FOUND and join nothing', async () => {
    const { workspaceId, boardId } = await boardOfNewOwner();
    const stranger = await createUserWithToken();
    const socket = await connected(open({ token: stranger.token }));

    for (const [event, payload] of [
      [ROOM_EVENTS.boardJoin, { boardId }],
      [ROOM_EVENTS.workspaceJoin, { workspaceId }],
      [ROOM_EVENTS.boardJoin, { boardId: boardData.unknownBoardId }],
      [ROOM_EVENTS.workspaceJoin, { workspaceId: unknownWorkspaceId }],
    ] as const) {
      expect(await roomRequest(socket, event, payload)).toEqual({ ok: false, code: 'NOT_FOUND' });
    }
    expect(await inRoom(boardRoom(boardId))).toEqual([]);
    expect(await inRoom(workspaceRoom(workspaceId))).toEqual([]);
  });

  it.each([undefined, {}, { boardId: 'not-a-cuid' }, 'board'])(
    'a malformed payload (%j) answers VALIDATION_ERROR',
    async (payload) => {
      const { owner } = await boardOfNewOwner();
      const socket = await connected(open({ token: owner.token }));

      expect(await roomRequest(socket, ROOM_EVENTS.boardJoin, payload)).toEqual({
        ok: false,
        code: 'VALIDATION_ERROR',
      });
    },
  );

  it('a join sent right before a leave of the same room ends outside it (messages run in order)', async () => {
    const { owner, boardId } = await boardOfNewOwner();
    const socket = await connected(open({ token: owner.token }));

    const join = roomRequest(socket, ROOM_EVENTS.boardJoin, { boardId });
    const leave = roomRequest(socket, ROOM_EVENTS.boardLeave, { boardId });

    expect(await Promise.all([join, leave])).toEqual([{ ok: true }, { ok: true }]);
    expect(await inRoom(boardRoom(boardId))).toEqual([]);
  });

  it('a failure other than a refusal answers INTERNAL_ERROR, not NOT_FOUND', async () => {
    const { owner, boardId } = await boardOfNewOwner();
    const socket = await connected(open({ token: owner.token }));
    const findUnique = vi
      .spyOn(prisma.board, 'findUnique')
      .mockRejectedValueOnce(new Error('connection lost'));

    try {
      expect(await roomRequest(socket, ROOM_EVENTS.boardJoin, { boardId })).toEqual({
        ok: false,
        code: 'INTERNAL_ERROR',
      });
    } finally {
      findUnique.mockRestore();
    }
    expect(await inRoom(boardRoom(boardId))).toEqual([]);
  });

  it('a message without an ack callback is still handled', async () => {
    const { owner, boardId } = await boardOfNewOwner();
    const socket = await connected(open({ token: owner.token }));

    socket.emit(ROOM_EVENTS.boardJoin, { boardId });

    await expect.poll(() => inRoom(boardRoom(boardId)), { timeout: 3000 }).toEqual([owner.user.id]);
  });
});
