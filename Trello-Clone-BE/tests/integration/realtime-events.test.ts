import { ROOM_EVENTS, type RealtimeEvent } from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { attachmentData } from '../data/attachments';
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
/** `expected` may give part of `data` (toMatchObject). */
const envelope = (event: RealtimeEvent, expected: Record<string, unknown>) => {
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

describe('own changes', () => {
  it("the socket that made the request (X-Socket-Id) is left out; the user's other tabs hear it", async () => {
    const { owner, workspaceId, boardId } = await watchedBoard();
    const tabA = await watch(owner, workspaceId, boardId);
    const tabB = await watch(owner, workspaceId, boardId);
    const heardByA = recordEvents(tabA);

    const inB = nextEvent(tabB, 'list:created');
    await addList(owner, boardId, { title: 'From A' }).set('X-Socket-Id', tabA.id!).expect(201);
    await inB;
    // A later change without the header reaches A, so A was listening all along.
    const inA = nextEvent(tabA, 'list:created');
    await addList(owner, boardId, { title: 'From elsewhere' }).expect(201);
    await inA;

    expect(heardByA.map((e) => (e.data as { title: string }).title)).toEqual(['From elsewhere']);
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

// REALTIME-001b2: cards and comments.

/** A list on the watched board, with one card. */
async function withCard(owner: User, boardId: string) {
  const list = (await addList(owner, boardId, { title: 'To do' }).expect(201)).body.data;
  const card = (
    await request(app)
      .post(`${paths.lists}/${list.id}/cards`)
      .set(bearer(owner.token))
      .send({ title: 'Fix login' })
      .expect(201)
  ).body.data;
  return { listId: list.id as string, cardId: card.id as string, card };
}

describe('card events', () => {
  it('card:created, card:updated (with archived) and card:deleted reach the board room', async () => {
    const { owner, workspaceId, boardId, socket } = await watchedBoard();
    const list = (await addList(owner, boardId, { title: 'To do' }).expect(201)).body.data;

    const created = nextEvent(socket, 'card:created');
    const card = (
      await request(app)
        .post(`${paths.lists}/${list.id}/cards`)
        .set(bearer(owner.token))
        .send({ title: 'Fix login' })
        .expect(201)
    ).body.data;
    envelope(await created, {
      type: 'card:created',
      boardId,
      workspaceId,
      actorId: owner.user.id,
      data: card,
    });

    const updated = nextEvent(socket, 'card:updated');
    const patched = (
      await request(app)
        .patch(`${paths.cards}/${card.id}`)
        .set(bearer(owner.token))
        .send({ title: 'Fix the login', archived: true })
        .expect(200)
    ).body.data;
    const event = await updated;
    envelope(event, {
      type: 'card:updated',
      data: { ...card, title: 'Fix the login', archived: true },
    });
    expect(event.version).toBe(Date.parse(patched.updatedAt));

    const deleted = nextEvent(socket, 'card:deleted');
    await request(app).delete(`${paths.cards}/${card.id}`).set(bearer(owner.token)).expect(204);
    envelope(await deleted, { type: 'card:deleted', data: { cardId: card.id, listId: list.id } });
  });

  it('card:moved within a board, and to another board (both boards hear it)', async () => {
    const { owner, workspaceId, boardId, socket } = await watchedBoard();
    const { listId, cardId } = await withCard(owner, boardId);
    const doing = (await addList(owner, boardId, { title: 'Doing' }).expect(201)).body.data;

    const within = nextEvent(socket, 'card:moved');
    await request(app)
      .patch(`${paths.cards}/${cardId}/move`)
      .set(bearer(owner.token))
      .send({ listId: doing.id, position: 2048 })
      .expect(200);
    envelope(await within, {
      type: 'card:moved',
      boardId,
      data: {
        cardId,
        fromListId: listId,
        toListId: doing.id,
        fromBoardId: boardId,
        toBoardId: boardId,
        position: 2048,
      },
    });

    // Another board of the same workspace, watched by its own socket.
    const other = (
      await request(app)
        .post(`${paths.workspaces}/${workspaceId}/boards`)
        .set(bearer(owner.token))
        .send({ title: 'Other' })
        .expect(201)
    ).body.data;
    const target = (await addList(owner, other.id, { title: 'Inbox' }).expect(201)).body.data;
    const otherSocket = await watch(owner, workspaceId, other.id);
    const left = nextEvent(socket, 'card:moved');
    const joined = nextEvent(otherSocket, 'card:moved');
    await request(app)
      .patch(`${paths.cards}/${cardId}/move`)
      .set(bearer(owner.token))
      .send({ listId: target.id, position: 1024 })
      .expect(200);
    for (const event of await Promise.all([left, joined])) {
      envelope(event, {
        boardId: other.id,
        data: { cardId, fromBoardId: boardId, toBoardId: other.id, toListId: target.id },
      });
    }
  });

  it('a card rebalance sends one card:reordered with every new position in the list', async () => {
    const { owner, boardId, socket } = await watchedBoard();
    const { listId, cardId } = await withCard(owner, boardId);
    const first = await testPrisma.card.findUniqueOrThrow({ where: { id: cardId } });

    const reordered = nextEvent(socket, 'card:reordered');
    await request(app)
      .post(`${paths.lists}/${listId}/cards`)
      .set(bearer(owner.token))
      .send({ title: 'Squeezed', position: first.position + 1e-7 })
      .expect(201);

    const event = await reordered;
    const stored = await testPrisma.card.findMany({ where: { listId } });
    expect(event.data).toEqual({
      listId,
      positions: Object.fromEntries(stored.map((card) => [card.id, card.position])),
    });
  });

  it('labels, members and checklist progress send card:updated only on a real change', async () => {
    const { owner, member, boardId, socket } = await watchedBoard();
    const { cardId } = await withCard(owner, boardId);
    const label = await testPrisma.label.findFirstOrThrow({ where: { boardId } });
    const heard = recordEvents(socket);
    const as = bearer(owner.token);

    let next = nextEvent(socket, 'card:updated');
    await request(app).post(`${paths.cards}/${cardId}/labels/${label.id}`).set(as).expect(204);
    expect((await next).data.labelIds).toEqual([label.id]);
    await request(app).post(`${paths.cards}/${cardId}/labels/${label.id}`).set(as).expect(204);

    next = nextEvent(socket, 'card:updated');
    await request(app)
      .post(`${paths.cards}/${cardId}/members/${member.user.id}`)
      .set(as)
      .expect(204);
    expect((await next).data.memberIds).toEqual([member.user.id]);

    next = nextEvent(socket, 'card:updated');
    const checklist = (
      await request(app)
        .post(`${paths.cards}/${cardId}/checklists`)
        .set(as)
        .send({ title: 'Launch' })
        .expect(201)
    ).body.data;
    const item = (
      await request(app)
        .post(`${paths.checklists}/${checklist.id}/items`)
        .set(as)
        .send({ content: 'Ship' })
        .expect(201)
    ).body.data;
    expect((await next).data.checklist).toEqual({ done: 0, total: 1 });

    next = nextEvent(socket, 'card:updated');
    const itemPath = `${paths.checklists}/${checklist.id}/items/${item.id}`;
    await request(app).patch(itemPath).set(as).send({ done: true }).expect(200);
    expect((await next).data.checklist).toEqual({ done: 1, total: 1 });
    // An edit of the item's text changes nothing on the tile: no event.
    await request(app).patch(itemPath).set(as).send({ content: 'Ship it' }).expect(200);

    next = nextEvent(socket, 'card:updated');
    await request(app).delete(`${paths.cards}/${cardId}/labels/${label.id}`).set(as).expect(204);
    expect((await next).data.labelIds).toEqual([]);

    next = nextEvent(socket, 'card:updated');
    const memberPath = `${paths.cards}/${cardId}/members/${member.user.id}`;
    await request(app).delete(memberPath).set(as).expect(204);
    expect((await next).data.memberIds).toEqual([]);
    await request(app).delete(memberPath).set(as).expect(204); // not assigned: nothing changes

    next = nextEvent(socket, 'card:updated');
    await request(app).delete(itemPath).set(as).expect(204);
    expect((await next).data.checklist).toEqual({ done: 0, total: 0 });

    const second = (
      await request(app)
        .post(`${paths.checklists}/${checklist.id}/items`)
        .set(as)
        .send({ content: 'Tell users' })
        .expect(201)
    ).body.data;
    expect(second.id).toBeTruthy();
    next = nextEvent(socket, 'card:updated');
    await request(app).delete(`${paths.checklists}/${checklist.id}`).set(as).expect(204);
    expect((await next).data.checklist).toEqual({ done: 0, total: 0 });

    // One event per real change (label, member, item added, tick, unlabel, unassign, item
    // deleted, item added, checklist deleted); the repeated attach, the text edit and the second
    // unassign sent nothing.
    expect(heard.filter((e) => e.type === 'card:updated')).toHaveLength(9);
  });
});

describe('card and comment failures', () => {
  it('a refused or rolled-back card or comment change sends nothing', async () => {
    const { owner, workspaceId, boardId, socket } = await watchedBoard();
    const { cardId } = await withCard(owner, boardId);
    const other = await watchedBoard(); // another workspace
    const foreignLabel = await testPrisma.label.findFirstOrThrow({
      where: { boardId: other.boardId },
    });
    const otherList = (await addList(other.owner, other.boardId, { title: 'X' }).expect(201)).body
      .data;
    // The owner of the first workspace may see the other board: make them a member there too.
    await testPrisma.workspaceMember.create({
      data: { userId: owner.user.id, workspaceId: other.workspaceId, role: 'MEMBER' },
    });
    const heard = recordEvents(socket);
    const as = bearer(owner.token);

    // Refused before any write: another board's label (422), a list in another workspace (422).
    await request(app)
      .post(`${paths.cards}/${cardId}/labels/${foreignLabel.id}`)
      .set(as)
      .expect(422);
    await request(app)
      .patch(`${paths.cards}/${cardId}/move`)
      .set(as)
      .send({ listId: otherList.id, position: 1024 })
      .expect(422);
    // Written, then rolled back: a comment whose transaction fails after the insert.
    const original = prisma.$transaction.bind(prisma) as (
      fn: (tx: unknown) => Promise<unknown>,
    ) => Promise<unknown>;
    vi.spyOn(prisma, '$transaction').mockImplementationOnce(((
      fn: (tx: unknown) => Promise<unknown>,
    ) =>
      original(async (tx) => {
        await fn(tx);
        throw new Error('rolled back');
      })) as never);
    await request(app)
      .post(`${paths.cards}/${cardId}/comments`)
      .set(as)
      .send({ content: 'Lost' })
      .expect(500);
    expect(await testPrisma.comment.count({ where: { cardId } })).toBe(0);

    // The socket was listening all along: a real change is heard.
    const created = nextEvent(socket, 'list:created');
    await addList(owner, boardId, { title: 'Heard' }).expect(201);
    await created;
    expect(heard.map((e) => e.type)).toEqual(['list:created']);
    expect(workspaceId).not.toBe(other.workspaceId);
  });

  it('a failed read of the tile after the commit loses only the event, not the change', async () => {
    const { owner, boardId, socket } = await watchedBoard();
    const { cardId } = await withCard(owner, boardId);
    const label = await testPrisma.label.findFirstOrThrow({ where: { boardId } });
    const heard = recordEvents(socket);
    const original = prisma.card.findUnique.bind(prisma.card);
    // The tile read (it includes the label and member ids) fails; the access check does not.
    vi.spyOn(prisma.card, 'findUnique').mockImplementation(((args: { include?: unknown }) =>
      args.include ? Promise.reject(new Error('read failed')) : original(args as never)) as never);

    await request(app)
      .post(`${paths.cards}/${cardId}/labels/${label.id}`)
      .set(bearer(owner.token))
      .expect(204);

    vi.restoreAllMocks();
    expect(await testPrisma.cardLabel.count({ where: { cardId } })).toBe(1);
    const created = nextEvent(socket, 'list:created');
    await addList(owner, boardId, { title: 'Heard' }).expect(201);
    await created;
    expect(heard.map((e) => e.type)).toEqual(['list:created']);
  });

  it('a move to another board that rebalances sends card:reordered to the target board only', async () => {
    const { owner, workspaceId, boardId, socket } = await watchedBoard();
    const { cardId } = await withCard(owner, boardId);
    const other = (
      await request(app)
        .post(`${paths.workspaces}/${workspaceId}/boards`)
        .set(bearer(owner.token))
        .send({ title: 'Other' })
        .expect(201)
    ).body.data;
    const target = (await addList(owner, other.id, { title: 'Inbox' }).expect(201)).body.data;
    await request(app)
      .post(`${paths.lists}/${target.id}/cards`)
      .set(bearer(owner.token))
      .send({ title: 'Already there', position: 1024 })
      .expect(201);
    const otherSocket = await watch(owner, workspaceId, other.id);
    const heard = recordEvents(socket);

    const reordered = nextEvent(otherSocket, 'card:reordered');
    const moved = nextEvent(socket, 'card:moved');
    await request(app)
      .patch(`${paths.cards}/${cardId}/move`)
      .set(bearer(owner.token))
      .send({ listId: target.id, position: 1024 + 1e-7 })
      .expect(200);

    expect((await reordered).data.listId).toBe(target.id);
    await moved;
    expect(heard.map((e) => e.type)).toEqual(['card:moved']);
  });
});

describe('comment events', () => {
  it('comment:created, comment:updated and comment:deleted, and the tile count follows', async () => {
    const { owner, boardId, socket } = await watchedBoard();
    const { cardId } = await withCard(owner, boardId);
    const as = bearer(owner.token);

    const created = nextEvent(socket, 'comment:created');
    let tile = nextEvent(socket, 'card:updated');
    const comment = (
      await request(app)
        .post(`${paths.cards}/${cardId}/comments`)
        .set(as)
        .send({ content: 'Hi' })
        .expect(201)
    ).body.data;
    envelope(await created, { type: 'comment:created', boardId, data: comment });
    expect((await tile).data.commentCount).toBe(1);

    const updated = nextEvent(socket, 'comment:updated');
    const edited = (
      await request(app)
        .patch(`${paths.comments}/${comment.id}`)
        .set(as)
        .send({ content: 'Hello' })
        .expect(200)
    ).body.data;
    const event = await updated;
    envelope(event, { type: 'comment:updated', data: edited });
    expect(event.version).toBe(Date.parse(edited.updatedAt));

    const deleted = nextEvent(socket, 'comment:deleted');
    tile = nextEvent(socket, 'card:updated');
    await request(app).delete(`${paths.comments}/${comment.id}`).set(as).expect(204);
    envelope(await deleted, { type: 'comment:deleted', data: { commentId: comment.id, cardId } });
    expect((await tile).data.commentCount).toBe(0);
  });
});

// ATTACHMENTS-001: a cover set or its attachment deleted is a card:updated with the signed coverUrl.
describe('cover events', () => {
  it('card:updated carries the new coverUrl, and null once the cover attachment is deleted', async () => {
    const { owner, boardId, socket } = await watchedBoard();
    const { cardId } = await withCard(owner, boardId);

    const uploaded = nextEvent(socket, 'card:updated');
    const image = (
      await request(app)
        .post(`${paths.cards}/${cardId}/attachments`)
        .set(bearer(owner.token))
        .attach('file', attachmentData.png.bytes, attachmentData.png.name)
        .expect(201)
    ).body.data;
    expect((await uploaded).data).toMatchObject({ id: cardId, coverUrl: null });
    const { storageKey } = await testPrisma.attachment.findUniqueOrThrow({
      where: { id: image.id as string },
    });

    const covered = nextEvent(socket, 'card:updated');
    await request(app)
      .patch(`${paths.cards}/${cardId}`)
      .set(bearer(owner.token))
      .send({ coverAttachmentId: image.id })
      .expect(200);
    expect((await covered).data.coverUrl).toContain(storageKey);

    const uncovered = nextEvent(socket, 'card:updated');
    await request(app)
      .delete(`${paths.attachments}/${image.id as string}`)
      .set(bearer(owner.token))
      .expect(204);
    expect((await uncovered).data).toMatchObject({ id: cardId, coverUrl: null });
  });
});
