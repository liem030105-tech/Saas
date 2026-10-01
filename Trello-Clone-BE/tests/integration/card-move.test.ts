import {
  BoardDetailDtoSchema,
  ErrorResponseSchema,
  MoveCardResultSchema,
  POSITION_STEP,
  positionBetween,
  REBALANCE_THRESHOLD,
} from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { invalidMoveBodies, moveData } from '../data/cards';
import { paths } from '../data/http';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Role } from '@trello-clone/shared';
import type { Express } from 'express';

// CARD-003: PATCH /cards/:cardId/move (docs/api/cards.md → Move). The role matrix and tenant
// isolation run in their own suites.

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

const post = <T = string>(user: User, path: string, body: object) =>
  request(app)
    .post(path)
    .set(bearer(user.token))
    .send(body)
    .expect(201)
    .then((res) => res.body.data.id as T);

const newWorkspace = (owner: User, name: string) => post(owner, paths.workspaces, { name });
const newBoard = (owner: User, workspaceId: string, title: string) =>
  post(owner, `${paths.workspaces}/${workspaceId}/boards`, { title });
const newList = (owner: User, boardId: string, title: string) =>
  post(owner, `${paths.boards}/${boardId}/lists`, { title });
const newCard = (owner: User, listId: string, title: string) =>
  post(owner, `${paths.lists}/${listId}/cards`, { title });

/**
 * A workspace with board A (To do: First, Second, Third; Doing: empty) and board B (Done: empty),
 * owned by a new user; plus a member with `role` if given.
 */
async function workspaceWith(role?: Role) {
  const owner = await createUserWithToken();
  const workspaceId = await newWorkspace(owner, moveData.workspaceName.home);
  const boardA = await newBoard(owner, workspaceId, moveData.boards.a);
  const boardB = await newBoard(owner, workspaceId, moveData.boards.b);
  const todo = await newList(owner, boardA, moveData.lists.todo);
  const doing = await newList(owner, boardA, moveData.lists.doing);
  const done = await newList(owner, boardB, moveData.lists.done);
  const cards: Record<string, string> = {};
  for (const title of moveData.cards) cards[title] = await newCard(owner, todo, title);
  let member = owner;
  if (role) {
    member = await createUserWithToken();
    await testPrisma.workspaceMember.create({
      data: { userId: member.user.id, workspaceId, role },
    });
  }
  return { owner, member, workspaceId, boardA, boardB, lists: { todo, doing, done }, cards };
}

const moveCard = (user: User, cardId: string, body: object) =>
  request(app).patch(`${paths.cards}/${cardId}/move`).set(bearer(user.token)).send(body);

/** Card titles per list, in the order GET /boards/:boardId returns them. */
async function cardsOn(boardId: string, user: User) {
  const res = await request(app)
    .get(`${paths.boards}/${boardId}`)
    .set(bearer(user.token))
    .expect(200);
  const board = BoardDetailDtoSchema.parse(res.body.data);
  return Object.fromEntries(
    board.lists.map((list) => [list.title, list.cards.map((card) => card.title)]),
  );
}

describe('PATCH /api/v1/cards/:cardId/move', () => {
  it('200: reorders within a list, with the final position and CARD_MOVED', async () => {
    const { member, boardA, lists, cards } = await workspaceWith('MEMBER');

    const res = await moveCard(member, cards.Third!, { listId: lists.todo, position: 512 });

    expect(res.status).toBe(200);
    expect(MoveCardResultSchema.parse(res.body.data)).toMatchObject({
      id: cards.Third,
      listId: lists.todo,
      boardId: boardA,
      position: 512,
    });
    expect((await cardsOn(boardA, member))[moveData.lists.todo]).toEqual([
      'Third',
      'First',
      'Second',
    ]);
    const activity = await testPrisma.activity.findFirstOrThrow({ where: { type: 'CARD_MOVED' } });
    expect(activity).toMatchObject({
      boardId: boardA,
      cardId: cards.Third,
      userId: member.user.id,
      data: {
        fromListId: lists.todo,
        toListId: lists.todo,
        fromBoardId: boardA,
        toBoardId: boardA,
      },
    });
  });

  it('moves to another list on the same board', async () => {
    const { owner, boardA, lists, cards } = await workspaceWith();

    await moveCard(owner, cards.First!, { listId: lists.doing, position: 1024 }).expect(200);

    expect(await cardsOn(boardA, owner)).toEqual({
      [moveData.lists.todo]: ['Second', 'Third'],
      [moveData.lists.doing]: ['First'],
    });
  });

  it('moves to another board in the workspace: boardId follows the list (I1)', async () => {
    const { owner, boardA, boardB, lists, cards } = await workspaceWith();

    const res = await moveCard(owner, cards.Second!, { listId: lists.done, position: 1024 });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ listId: lists.done, boardId: boardB });
    const stored = await testPrisma.card.findUniqueOrThrow({ where: { id: cards.Second! } });
    expect(stored).toMatchObject({ listId: lists.done, boardId: boardB });
    expect((await cardsOn(boardA, owner))[moveData.lists.todo]).toEqual(['First', 'Third']);
    expect((await cardsOn(boardB, owner))[moveData.lists.done]).toEqual(['Second']);
    const activity = await testPrisma.activity.findFirstOrThrow({ where: { type: 'CARD_MOVED' } });
    expect(activity).toMatchObject({
      boardId: boardB,
      data: {
        fromListId: lists.todo,
        toListId: lists.done,
        fromBoardId: boardA,
        toBoardId: boardB,
      },
    });
  });

  it('archived cards and archived lists can be moved / moved to', async () => {
    const { owner, lists, cards } = await workspaceWith();
    await testPrisma.card.update({ where: { id: cards.First! }, data: { archived: true } });
    await testPrisma.list.update({ where: { id: lists.doing }, data: { archived: true } });

    const res = await moveCard(owner, cards.First!, { listId: lists.doing, position: 1024 });

    expect(res.status).toBe(200);
  });

  it('a crowded gap rebalances the target list; the order matches the board', async () => {
    const { owner, boardA, lists } = await workspaceWith();
    // Third keeps landing between First and Second, then Second between First and Third, …:
    // the gap after First halves with every move.
    const order = ['First', 'Second', 'Third'];
    const positions: number[] = [];
    for (let i = 0; i < moveData.gapMoves; i += 1) {
      const all = await testPrisma.card.findMany({
        where: { listId: lists.todo },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      });
      const [first, second, last] = all;
      const res = await moveCard(owner, last!.id, {
        listId: lists.todo,
        position: positionBetween(first!.position, second!.position),
      }).expect(200);
      positions.push(res.body.data.position);
      order.splice(1, 0, order.pop()!);
    }

    expect((await cardsOn(boardA, owner))[moveData.lists.todo]).toEqual(order);
    expect(positions.some((position, i) => i > 0 && position % POSITION_STEP === 0)).toBe(true);
    const stored = await testPrisma.card.findMany({
      where: { listId: lists.todo },
      orderBy: { position: 'asc' },
    });
    const gaps = stored.slice(1).map((card, i) => card.position - stored[i]!.position);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(REBALANCE_THRESHOLD);
  });

  it('two parallel moves into the same list both succeed; the order is deterministic', async () => {
    const { owner, boardA, lists, cards } = await workspaceWith();
    await newCard(owner, lists.doing, 'Doing card'); // 1024 in Doing

    const results = await Promise.all([
      moveCard(owner, cards.First!, { listId: lists.doing, position: 2048 }),
      moveCard(owner, cards.Second!, { listId: lists.doing, position: 2048 }),
    ]);

    expect(results.map((res) => res.status)).toEqual([200, 200]);
    const stored = await testPrisma.card.findMany({
      where: { listId: lists.doing },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    // Whatever the timing, the board shows the stored order (position, then id).
    const doing = (await cardsOn(boardA, owner))[moveData.lists.doing];
    expect(doing).toEqual(
      stored.map((card) =>
        card.id === cards.First ? 'First' : card.id === cards.Second ? 'Second' : 'Doing card',
      ),
    );
    expect(doing![0]).toBe('Doing card');
  });

  it('moves in opposite directions between two lists never deadlock', async () => {
    const { owner, boardA, lists, cards } = await workspaceWith();
    const back = await newCard(owner, lists.doing, 'Doing card');
    const titleOf = { [cards.First!]: 'First', [back]: 'Doing card' };

    // First goes to Doing while Doing card goes to To do, at the same moment, then back again.
    const [a, b] = [cards.First!, back];
    let [aTo, bTo] = [lists.doing, lists.todo];
    for (let round = 0; round < moveData.parallelRounds; round += 1) {
      const results = await Promise.all([
        moveCard(owner, a, { listId: aTo, position: 512 }),
        moveCard(owner, b, { listId: bTo, position: 512 }),
      ]);
      expect(results.map((res) => res.status)).toEqual([200, 200]);
      [aTo, bTo] = [bTo, aTo];
    }

    // An even number of rounds puts every card back where it started.
    const board = await cardsOn(boardA, owner);
    expect(board[moveData.lists.doing]).toContain(titleOf[back]);
    expect(board[moveData.lists.todo]).toContain(titleOf[a]);
    const moves = await testPrisma.activity.findMany({
      where: { type: 'CARD_MOVED', cardId: cards.First! },
      orderBy: { createdAt: 'asc' },
    });
    // Each logged move starts where the previous one ended (`from` is read under the locks).
    for (let i = 1; i < moves.length; i += 1) {
      const previous = moves[i - 1]!.data as { toListId: string };
      expect((moves[i]!.data as { fromListId: string }).fromListId).toBe(previous.toListId);
    }
  });

  it('422 CROSS_WORKSPACE_MOVE to a visible list in another workspace; nothing changes', async () => {
    const { owner, lists, cards } = await workspaceWith();
    const otherWorkspace = await newWorkspace(owner, moveData.workspaceName.other);
    const otherBoard = await newBoard(owner, otherWorkspace, moveData.boards.other);
    const otherList = await newList(owner, otherBoard, moveData.lists.todo);

    const res = await moveCard(owner, cards.First!, { listId: otherList, position: 1024 });

    expect(res.status).toBe(422);
    const { error } = ErrorResponseSchema.parse(res.body);
    expect(error.code).toBe('BUSINESS_RULE_VIOLATION');
    expect(error.details[0]).toMatchObject({ rule: 'CROSS_WORKSPACE_MOVE' });
    expect(await testPrisma.card.findUniqueOrThrow({ where: { id: cards.First! } })).toMatchObject({
      listId: lists.todo,
      position: 1024,
    });
  });

  it('404 to a list the caller cannot see; nothing changes', async () => {
    const { owner, lists, cards } = await workspaceWith();
    const stranger = await createUserWithToken();
    const strangersWorkspace = await newWorkspace(stranger, moveData.workspaceName.other);
    const strangersBoard = await newBoard(stranger, strangersWorkspace, moveData.boards.other);
    const strangersList = await newList(stranger, strangersBoard, moveData.lists.todo);

    for (const listId of [strangersList, 'clx0000000000000000000094']) {
      expect((await moveCard(owner, cards.First!, { listId, position: 1024 })).status).toBe(404);
    }
    expect(await testPrisma.card.findUniqueOrThrow({ where: { id: cards.First! } })).toMatchObject({
      listId: lists.todo,
      position: 1024,
    });
    expect(await testPrisma.activity.count({ where: { type: 'CARD_MOVED' } })).toBe(0);
  });

  it.each(invalidMoveBodies)('400: $case', async ({ body }) => {
    const { owner, cards } = await workspaceWith();

    const res = await moveCard(owner, cards.First!, body);

    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('401 without a token', async () => {
    const { lists, cards } = await workspaceWith();

    const res = await request(app)
      .patch(`${paths.cards}/${cards.First}/move`)
      .send({ listId: lists.doing, position: 1024 });

    expect(res.status).toBe(401);
  });

  it('404 for a non-member, an unknown card and a malformed id', async () => {
    const { lists, cards } = await workspaceWith();
    const outsider = await createUserWithToken();

    for (const id of [cards.First!, 'clx0000000000000000000093', 'not-a-cuid']) {
      const res = await moveCard(outsider, id, { listId: lists.doing, position: 1024 });
      expect(res.status).toBe(404);
    }
  });

  it('403 for a VIEWER, and nothing moves', async () => {
    const { member, lists, cards } = await workspaceWith('VIEWER');

    expect(
      (await moveCard(member, cards.First!, { listId: lists.doing, position: 1024 })).status,
    ).toBe(403);
    expect(await testPrisma.card.findUniqueOrThrow({ where: { id: cards.First! } })).toMatchObject({
      listId: lists.todo,
    });
  });
});
