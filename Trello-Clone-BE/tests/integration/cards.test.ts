import {
  BoardDetailDtoSchema,
  CardDetailDtoSchema,
  CardSummaryDtoSchema,
  ErrorResponseSchema,
} from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { cardData, invalidCardBodies, invalidCardUpdates } from '../data/cards';
import { paths } from '../data/http';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Role } from '@trello-clone/shared';
import type { Express } from 'express';

// CARD-001, CARD-002: docs/api/cards.md. The full role matrix and tenant isolation run in their own suites
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

/** A card in a list on a fresh board (see listWith), created by the board's owner. */
async function cardWith(role?: Role) {
  const ctx = await listWith(role);
  const res = await createCard(ctx.listId, ctx.owner, cardData.create.input).expect(201);
  return { ...ctx, cardId: res.body.data.id as string };
}

const cardPath = (cardId: string) => `${paths.cards}/${cardId}`;
const getCard = (cardId: string, user: User) =>
  request(app).get(cardPath(cardId)).set(bearer(user.token));
const patchCard = (cardId: string, user: User, body: object) =>
  request(app).patch(cardPath(cardId)).set(bearer(user.token)).send(body);
const deleteCard = (cardId: string, user: User) =>
  request(app).delete(cardPath(cardId)).set(bearer(user.token));

describe('GET /api/v1/cards/:cardId', () => {
  it('200: a VIEWER gets the card detail', async () => {
    const { member, boardId, listId, cardId } = await cardWith('VIEWER');

    const res = await getCard(cardId, member);

    expect(res.status).toBe(200);
    expect(CardDetailDtoSchema.parse(res.body.data)).toMatchObject({
      id: cardId,
      boardId,
      listId,
      title: cardData.create.stored,
      description: null,
      dueDate: null,
      completed: false,
      archived: false,
      members: [],
      labels: [],
      checklists: [],
      attachments: [],
    });
  });

  it('an archived card is still returned', async () => {
    const { owner, cardId } = await cardWith();
    await testPrisma.card.update({ where: { id: cardId }, data: { archived: true } });

    const res = await getCard(cardId, owner).expect(200);

    expect(res.body.data.archived).toBe(true);
  });

  it('401 without a token', async () => {
    const { cardId } = await cardWith();

    expect((await request(app).get(cardPath(cardId))).status).toBe(401);
  });

  it('404 for a non-member, an unknown card and a malformed id', async () => {
    const { cardId } = await cardWith();
    const outsider = await createUserWithToken();

    for (const id of [cardId, cardData.unknownCardId, cardData.malformedCardId]) {
      expect((await getCard(id, outsider)).status).toBe(404);
    }
  });
});

describe('PATCH /api/v1/cards/:cardId', () => {
  it('200: a MEMBER edits the fields; CARD_UPDATED is logged without the description text', async () => {
    const { member, boardId, cardId } = await cardWith('MEMBER');

    const res = await patchCard(cardId, member, cardData.update.input);

    expect(res.status).toBe(200);
    expect(CardDetailDtoSchema.parse(res.body.data)).toMatchObject(cardData.update.stored);
    const activity = await testPrisma.activity.findFirstOrThrow({
      where: { type: 'CARD_UPDATED' },
    });
    expect(activity).toMatchObject({ boardId, cardId, userId: member.user.id });
    expect(activity.data).toEqual({
      title: cardData.update.stored.title,
      dueDate: cardData.update.stored.dueDate,
      completed: true,
      description: true,
    });
  });

  it('null clears the description and the due date', async () => {
    const { owner, cardId } = await cardWith();
    await patchCard(cardId, owner, cardData.update.input).expect(200);

    const res = await patchCard(cardId, owner, { description: null, dueDate: null }).expect(200);

    expect(res.body.data).toMatchObject({ description: null, dueDate: null });
  });

  it('archiving logs CARD_ARCHIVED and hides the card from the board', async () => {
    const { owner, boardId, cardId } = await cardWith();

    await patchCard(cardId, owner, { archived: true }).expect(200);

    const archived = await testPrisma.activity.findFirstOrThrow({
      where: { type: 'CARD_ARCHIVED' },
    });
    expect(archived).toMatchObject({ cardId, data: { archived: true } });
    // Archiving an archived card again is an update, not a second CARD_ARCHIVED.
    await patchCard(cardId, owner, { archived: true }).expect(200);
    expect(await testPrisma.activity.count({ where: { type: 'CARD_ARCHIVED' } })).toBe(1);
    const [list] = (await detailOf(boardId, owner)).lists;
    expect(list!.cards).toEqual([]);
  });

  it.each(invalidCardUpdates)('400: $case', async ({ body }) => {
    const { owner, cardId } = await cardWith();

    const res = await patchCard(cardId, owner, body);

    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('401 without a token', async () => {
    const { cardId } = await cardWith();

    expect((await request(app).patch(cardPath(cardId)).send({ completed: true })).status).toBe(401);
  });

  it('404 for a non-member, an unknown card and a malformed id; nothing changes', async () => {
    const { cardId } = await cardWith();
    const outsider = await createUserWithToken();

    for (const id of [cardId, cardData.unknownCardId, cardData.malformedCardId]) {
      expect((await patchCard(id, outsider, { completed: true })).status).toBe(404);
    }
    expect(await testPrisma.card.findUnique({ where: { id: cardId } })).toMatchObject({
      completed: false,
    });
  });

  it('403 for a VIEWER, and nothing changes', async () => {
    const { member, cardId } = await cardWith('VIEWER');

    expect((await patchCard(cardId, member, { completed: true })).status).toBe(403);
    expect(await testPrisma.card.findUnique({ where: { id: cardId } })).toMatchObject({
      completed: false,
    });
  });
});

describe('DELETE /api/v1/cards/:cardId', () => {
  it('204: a MEMBER deletes a card; its activity stays without the card', async () => {
    const { member, cardId } = await cardWith('MEMBER');

    expect((await deleteCard(cardId, member)).status).toBe(204);

    expect(await testPrisma.card.count()).toBe(0);
    const created = await testPrisma.activity.findFirstOrThrow({ where: { type: 'CARD_CREATED' } });
    expect(created.cardId).toBeNull();
    expect((await deleteCard(cardId, member)).status).toBe(404);
  });

  it('401 without a token', async () => {
    const { cardId } = await cardWith();

    expect((await request(app).delete(cardPath(cardId))).status).toBe(401);
  });

  it('404 for a non-member, an unknown card and a malformed id; nothing is deleted', async () => {
    const { cardId } = await cardWith();
    const outsider = await createUserWithToken();

    for (const id of [cardId, cardData.unknownCardId, cardData.malformedCardId]) {
      expect((await deleteCard(id, outsider)).status).toBe(404);
    }
    expect(await testPrisma.card.count()).toBe(1);
  });

  it('403 for a VIEWER, and nothing is deleted', async () => {
    const { member, cardId } = await cardWith('VIEWER');

    expect((await deleteCard(cardId, member)).status).toBe(403);
    expect(await testPrisma.card.count()).toBe(1);
  });
});
