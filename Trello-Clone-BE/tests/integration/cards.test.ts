import {
  BoardDetailDtoSchema,
  CardSummaryDtoSchema,
  ErrorResponseSchema,
} from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { cardData, invalidCardBodies } from '../data/cards';
import { paths } from '../data/http';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Role } from '@trello-clone/shared';
import type { Express } from 'express';

// CARD-001: docs/api/cards.md. The full role matrix and tenant isolation run in their own suites
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

const cardsPath = (listId: string) => `${paths.lists}/${listId}/cards`;

/** A list on a fresh board owned by a new user, plus a member with `role` if given. */
async function listWith(role?: Role) {
  const owner = await createUserWithToken();
  const workspace = await request(app)
    .post(paths.workspaces)
    .set(bearer(owner.token))
    .send({ name: cardData.workspaceName })
    .expect(201);
  const workspaceId = workspace.body.data.id as string;
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
  let member: User | undefined;
  if (role) {
    member = await createUserWithToken();
    await testPrisma.workspaceMember.create({
      data: { userId: member.user.id, workspaceId, role },
    });
  }
  return { owner, member: member ?? owner, boardId, listId: list.body.data.id as string };
}

const createCard = (listId: string, user: User, body: object) =>
  request(app).post(cardsPath(listId)).set(bearer(user.token)).send(body);

const detailOf = async (boardId: string, user: User) =>
  BoardDetailDtoSchema.parse(
    (await request(app).get(`${paths.boards}/${boardId}`).set(bearer(user.token)).expect(200)).body
      .data,
  );

describe('POST /api/v1/lists/:listId/cards', () => {
  it('201: a MEMBER adds a card; boardId comes from the list, and CARD_CREATED is logged', async () => {
    const { member, boardId, listId } = await listWith('MEMBER');

    const res = await createCard(listId, member, cardData.create.input);

    expect(res.status).toBe(201);
    const card = CardSummaryDtoSchema.parse(res.body.data);
    expect(card).toEqual({
      id: card.id,
      listId,
      title: cardData.create.stored,
      position: 1024,
      dueDate: null,
      completed: false,
      coverUrl: null,
      labelIds: [],
      memberIds: [],
      checklist: { done: 0, total: 0 },
      commentCount: 0,
    });
    const stored = await testPrisma.card.findUniqueOrThrow({ where: { id: card.id } });
    expect(stored.boardId).toBe(boardId); // I1
    const activity = await testPrisma.activity.findFirst({ where: { type: 'CARD_CREATED' } });
    expect(activity).toMatchObject({
      boardId,
      cardId: card.id,
      userId: member.user.id,
      data: { listId, title: cardData.create.stored },
    });
  });

  it('a boardId in the body is ignored (I1)', async () => {
    const { owner, boardId, listId } = await listWith();
    const other = await listWith();

    const res = await createCard(listId, owner, {
      ...cardData.create.input,
      boardId: other.boardId,
    }).expect(201);

    const stored = await testPrisma.card.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(stored.boardId).toBe(boardId);
  });

  it('appends without a position; the board shows the cards in creation order', async () => {
    const { owner, boardId, listId } = await listWith();

    const positions: number[] = [];
    for (const title of cardData.titles) {
      positions.push((await createCard(listId, owner, { title }).expect(201)).body.data.position);
    }

    expect(positions).toEqual([1024, 2048, 3072]);
    const [list] = (await detailOf(boardId, owner)).lists;
    expect(list!.cards.map((card) => card.title)).toEqual(cardData.titles);
  });

  it('appends after archived cards too, and the board hides them', async () => {
    const { owner, boardId, listId } = await listWith();
    const archived = await createCard(listId, owner, { title: cardData.archivedTitle }).expect(201);
    await testPrisma.card.update({
      where: { id: archived.body.data.id },
      data: { archived: true },
    });

    const res = await createCard(listId, owner, { title: cardData.titles[0] }).expect(201);

    expect(res.body.data.position).toBe(2048);
    const [list] = (await detailOf(boardId, owner)).lists;
    expect(list!.cards.map((card) => card.title)).toEqual([cardData.titles[0]]);
  });

  it('a client position goes through the rebalance check', async () => {
    const { owner, boardId, listId } = await listWith();
    await createCard(listId, owner, { title: cardData.titles[0] }).expect(201);
    await createCard(listId, owner, { title: cardData.titles[1], position: 512 }).expect(201);

    // Squeezed against the first card: the list is renumbered.
    const res = await createCard(listId, owner, {
      title: cardData.titles[2],
      position: 512.0000001,
    }).expect(201);

    expect(res.body.data.position).toBe(2048);
    const [list] = (await detailOf(boardId, owner)).lists;
    expect(list!.cards.map((card) => [card.title, card.position])).toEqual([
      [cardData.titles[1], 1024],
      [cardData.titles[2], 2048],
      [cardData.titles[0], 3072],
    ]);
  });

  it.each(invalidCardBodies)('400: $case', async ({ body }) => {
    const { owner, listId } = await listWith();

    const res = await createCard(listId, owner, body);

    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    expect(await testPrisma.card.count()).toBe(0);
  });

  it('401 without a token', async () => {
    const { listId } = await listWith();

    expect((await request(app).post(cardsPath(listId)).send(cardData.create.input)).status).toBe(
      401,
    );
  });

  it('404 for a non-member, an unknown list and a malformed id', async () => {
    const { listId } = await listWith();
    const outsider = await createUserWithToken();

    for (const id of [listId, cardData.unknownListId, cardData.malformedListId]) {
      expect((await createCard(id, outsider, cardData.create.input)).status).toBe(404);
    }
    expect(await testPrisma.card.count()).toBe(0);
  });

  it('403 for a VIEWER, and nothing is created', async () => {
    const { member, listId } = await listWith('VIEWER');

    expect((await createCard(listId, member, cardData.create.input)).status).toBe(403);
    expect(await testPrisma.card.count()).toBe(0);
  });
});

describe('deleting a list or board with cards', () => {
  it('deleting a list deletes its cards and keeps their activity, without the card', async () => {
    const { owner, listId } = await listWith();
    await createCard(listId, owner, cardData.create.input).expect(201);

    await request(app).delete(`${paths.lists}/${listId}`).set(bearer(owner.token)).expect(204);

    expect(await testPrisma.card.count()).toBe(0);
    const activity = await testPrisma.activity.findFirstOrThrow({
      where: { type: 'CARD_CREATED' },
    });
    expect(activity.cardId).toBeNull();
  });

  it('deleting the board deletes its cards', async () => {
    const { owner, boardId, listId } = await listWith();
    await createCard(listId, owner, cardData.create.input).expect(201);

    await request(app).delete(`${paths.boards}/${boardId}`).set(bearer(owner.token)).expect(204);

    expect(await testPrisma.card.count()).toBe(0);
  });
});
