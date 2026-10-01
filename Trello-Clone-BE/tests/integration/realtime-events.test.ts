import { ROOM_EVENTS, type RealtimeEvent } from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { cardData } from '../data/cards';
import { paths } from '../data/http';
import { resetDb, testPrisma } from '../helpers/db';
import {
  clientFor,
  connected,
  nextEvent,
  recordEvents,
  roomRequest,
  startRealtime,
  type RealtimeHarness,
} from '../helpers/realtime';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Express } from 'express';
import type { Socket } from 'socket.io-client';

// REALTIME-001b: docs/architecture/realtime.md → Events, for boards, lists and members. Services
// emit after their transaction commits; a member watching the room hears each change.

let app: Express;
let harness: RealtimeHarness;
const sockets: Socket[] = [];

beforeAll(async () => {
  app = createTestApp();
  harness = await startRealtime(app);
});
beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
  for (const socket of sockets.splice(0)) socket.disconnect();
});
afterAll(async () => {
  await harness.close();
  await prisma.$disconnect();
  await testPrisma.$disconnect();
});

type User = Awaited<ReturnType<typeof createUserWithToken>>;

/** An owner's workspace and board, and a MEMBER watching both rooms. */
async function watchedBoard() {
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
  const boardId = board.body.data.id as string;
  const member = await createUserWithToken();
  await testPrisma.workspaceMember.create({
    data: { userId: member.user.id, workspaceId, role: 'MEMBER' },
  });
  const socket = await watch(member, workspaceId, boardId);
  return { owner, member, workspaceId, boardId, socket };
}

async function watch(user: User, workspaceId: string, boardId: string) {
  const socket = await connected(clientFor(harness.url, { token: user.token }));
  sockets.push(socket);
  expect(await roomRequest(socket, ROOM_EVENTS.workspaceJoin, { workspaceId })).toEqual({
    ok: true,
  });
  expect(await roomRequest(socket, ROOM_EVENTS.boardJoin, { boardId })).toEqual({ ok: true });
  return socket;
}

const addList = (user: User, boardId: string, body: { title: string; position?: number }) =>
  request(app).post(`${paths.boards}/${boardId}/lists`).set(bearer(user.token)).send(body);

/** The envelope every event shares. */
const envelope = (event: RealtimeEvent, expected: Partial<RealtimeEvent>) => {
  expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/);
  expect(typeof event.version).toBe('number');
  expect(event).toMatchObject(expected);
};

describe('board events', () => {
  it('board:created reaches the workspace room; board:updated and board:deleted also the board room', async () => {
    const { owner, workspaceId, boardId, socket } = await watchedBoard();

    const created = nextEvent(socket, 'board:created');
    const res = await request(app)
      .post(`${paths.workspaces}/${workspaceId}/boards`)
      .set(bearer(owner.token))
      .send({ title: 'Second' })
      .expect(201);
    const createdEvent = await created;
    envelope(createdEvent, {
      type: 'board:created',
      boardId: res.body.data.id,
      workspaceId,
      actorId: owner.user.id,
      data: res.body.data,
    });
    expect(createdEvent.version).toBe(Date.parse(res.body.data.updatedAt));

    const updated = nextEvent(socket, 'board:updated');
    const renamed = await request(app)
      .patch(`${paths.boards}/${boardId}`)
      .set(bearer(owner.token))
      .send({ title: 'Renamed' })
      .expect(200);
    envelope(await updated, { type: 'board:updated', boardId, data: renamed.body.data });

    const deleted = nextEvent(socket, 'board:deleted');
    await request(app).delete(`${paths.boards}/${boardId}`).set(bearer(owner.token)).expect(204);
    envelope(await deleted, { type: 'board:deleted', boardId, data: { boardId } });
    // The board's room is emptied.
    expect(await harness.io.in(`board:${boardId}`).fetchSockets()).toEqual([]);
  });
});

describe('list events', () => {
  it('list:created, list:updated, list:moved and list:deleted reach the board room', async () => {
    const { owner, workspaceId, boardId, socket } = await watchedBoard();

    const created = nextEvent(socket, 'list:created');
    const list = (await addList(owner, boardId, { title: 'To do' }).expect(201)).body.data;
    envelope(await created, {
      type: 'list:created',
      boardId,
      workspaceId,
      actorId: owner.user.id,
      data: list,
    });

    const updated = nextEvent(socket, 'list:updated');
    const renamed = await request(app)
      .patch(`${paths.lists}/${list.id}`)
      .set(bearer(owner.token))
      .send({ title: 'Doing' })
      .expect(200);
    envelope(await updated, { type: 'list:updated', data: renamed.body.data });

    const moved = nextEvent(socket, 'list:moved');
    const heard = recordEvents(socket);
    await request(app)
      .patch(`${paths.lists}/${list.id}`)
      .set(bearer(owner.token))
      .send({ position: 5000 })
      .expect(200);
    envelope(await moved, { type: 'list:moved', data: { listId: list.id, position: 5000 } });
    expect(heard.map((e) => e.type)).toEqual(['list:moved']); // a pure move is no update

    const deleted = nextEvent(socket, 'list:deleted');
    await request(app).delete(`${paths.lists}/${list.id}`).set(bearer(owner.token)).expect(204);
    envelope(await deleted, { type: 'list:deleted', data: { listId: list.id } });
  });

  it('a rebalance sends one list:reordered with every new position', async () => {
    const { owner, boardId, socket } = await watchedBoard();
    const first = (await addList(owner, boardId, { title: 'A', position: 1024 }).expect(201)).body
      .data;

    const reordered = nextEvent(socket, 'list:reordered');
    // Closer to the first one than REBALANCE_THRESHOLD, so the board's lists are rebalanced.
    const second = (
      await addList(owner, boardId, { title: 'B', position: 1024 + 1e-7 }).expect(201)
    ).body.data;

    const event = await reordered;
    const stored = await testPrisma.list.findMany({ where: { boardId } });
    expect(event.data.positions).toEqual(
      Object.fromEntries(stored.map((list) => [list.id, list.position])),
    );
    expect(Object.keys(event.data.positions).sort()).toEqual([first.id, second.id].sort());
  });

  it('a transaction that rolls back emits nothing', async () => {
    const { owner, boardId, socket } = await watchedBoard();
    const heard = recordEvents(socket);
    const original = prisma.$transaction.bind(prisma) as (
      fn: (tx: unknown) => Promise<unknown>,
    ) => Promise<unknown>;
    // The list and its activity are written, then the transaction fails and rolls back.
    const transaction = vi.spyOn(prisma, '$transaction').mockImplementationOnce(((
      fn: (tx: unknown) => Promise<unknown>,
    ) =>
      original(async (tx) => {
        await fn(tx);
        throw new Error('rolled back');
      })) as never);

    await addList(owner, boardId, { title: 'Lost' }).expect(500);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(await testPrisma.list.count({ where: { boardId } })).toBe(0);
    // A later change is heard, so the socket was listening all along.
    const created = nextEvent(socket, 'list:created');
    await addList(owner, boardId, { title: 'Kept' }).expect(201);
    await created;
    expect(heard.map((e) => (e.data as { title?: string }).title)).toEqual(['Kept']);
  });
});

describe('who hears what', () => {
  it('board events stay in their board room; workspace events in their workspace room', async () => {
    const { owner, workspaceId, boardId, socket } = await watchedBoard();
    // A member of the same workspace watching only the workspace room…
    const workspaceOnly = await createUserWithToken();
    await testPrisma.workspaceMember.create({
      data: { userId: workspaceOnly.user.id, workspaceId, role: 'VIEWER' },
    });
    const lobby = await connected(clientFor(harness.url, { token: workspaceOnly.token }));
    sockets.push(lobby);
    await roomRequest(lobby, ROOM_EVENTS.workspaceJoin, { workspaceId });
    // …and someone watching a board of another workspace.
    const other = await watchedBoard();
    const lobbyHeard = recordEvents(lobby);
    const outsiderHeard = recordEvents(other.socket);

    const listCreated = nextEvent(socket, 'list:created');
    await addList(owner, boardId, { title: 'Only here' }).expect(201);
    await listCreated;
    const boardUpdated = nextEvent(lobby, 'board:updated');
    await request(app)
      .patch(`${paths.boards}/${boardId}`)
      .set(bearer(owner.token))
      .send({ title: 'Seen in the lobby' })
      .expect(200);
    await boardUpdated;

    expect(lobbyHeard.map((e) => e.type)).toEqual(['board:updated']);
    expect(outsiderHeard).toEqual([]);
  });
});

describe('member:removed', () => {
  it("tells the workspace and the person, then evicts the person's sockets from its rooms", async () => {
    const { owner, member, workspaceId, boardId, socket } = await watchedBoard();
    const ownerSocket = await watch(owner, workspaceId, boardId);

    const toOwner = nextEvent(ownerSocket, 'member:removed');
    const toMember = nextEvent(socket, 'member:removed');
    await request(app)
      .delete(`${paths.workspaces}/${workspaceId}/members/${member.user.id}`)
      .set(bearer(owner.token))
      .expect(204);

    for (const event of await Promise.all([toOwner, toMember])) {
      envelope(event, {
        type: 'member:removed',
        boardId: null,
        workspaceId,
        actorId: owner.user.id,
        data: { userId: member.user.id },
      });
    }
    const heard = recordEvents(socket);
    const ownerHearsList = nextEvent(ownerSocket, 'list:created');
    await addList(owner, boardId, { title: 'After' }).expect(201);
    await ownerHearsList;
    const ownerHearsBoard = nextEvent(ownerSocket, 'board:created');
    await request(app)
      .post(`${paths.workspaces}/${workspaceId}/boards`)
      .set(bearer(owner.token))
      .send({ title: 'After' })
      .expect(201);
    await ownerHearsBoard;
    expect(heard).toEqual([]);
  });

  it('a join that was checked before the removal committed does not stay in the room', async () => {
    const { owner, workspaceId } = await watchedBoard();
    const leaving = await createUserWithToken();
    await testPrisma.workspaceMember.create({
      data: { userId: leaving.user.id, workspaceId, role: 'MEMBER' },
    });
    const socket = await connected(clientFor(harness.url, { token: leaving.token }));
    sockets.push(socket);
    const original = prisma.workspaceMember.findUnique.bind(prisma.workspaceMember);
    // The join's access check sees the membership, then the removal commits and evicts, and only
    // then does the join land.
    vi.spyOn(prisma.workspaceMember, 'findUnique').mockImplementationOnce(((args: never) =>
      original(args).then(async (membership) => {
        await request(app)
          .delete(`${paths.workspaces}/${workspaceId}/members/${leaving.user.id}`)
          .set(bearer(owner.token))
          .expect(204);
        return membership;
      })) as never);

    expect(await roomRequest(socket, ROOM_EVENTS.workspaceJoin, { workspaceId })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
    });
    expect(await harness.io.in(`workspace:${workspaceId}`).fetchSockets()).toHaveLength(1);
  });
});
