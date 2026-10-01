import { ActivitiesPageSchema, ErrorResponseSchema } from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { cardData } from '../data/cards';
import { paths } from '../data/http';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Express } from 'express';

// CARD-005e: docs/api/boards.md → GET /boards/:boardId/activities. The role matrix and tenant
// isolation of this route run in their own suites.

let app: Express;

beforeAll(() => {
  app = createTestApp();
});
beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
  await testPrisma.$disconnect();
});

/**
 * A board with a list holding two cards; the first is renamed and commented on. Logged, oldest
 * first: BOARD_CREATED, LIST_CREATED, CARD_CREATED ×2, CARD_UPDATED, COMMENT_ADDED.
 */
async function busyBoard() {
  const owner = await createUserWithToken();
  const as = bearer(owner.token);
  const ws = await request(app)
    .post(paths.workspaces)
    .set(as)
    .send({ name: cardData.workspaceName })
    .expect(201);
  const workspaceId = ws.body.data.id as string;
  const board = await request(app)
    .post(`${paths.workspaces}/${workspaceId}/boards`)
    .set(as)
    .send({ title: cardData.boardTitle })
    .expect(201);
  const boardId = board.body.data.id as string;
  const list = await request(app)
    .post(`${paths.boards}/${boardId}/lists`)
    .set(as)
    .send({ title: cardData.listTitle })
    .expect(201);
  const cardIds: string[] = [];
  for (const title of cardData.titles.slice(0, 2)) {
    const card = await request(app)
      .post(`${paths.lists}/${list.body.data.id as string}/cards`)
      .set(as)
      .send({ title })
      .expect(201);
    cardIds.push(card.body.data.id as string);
  }
  const [cardId, otherCardId] = cardIds as [string, string];
  await request(app)
    .patch(`${paths.cards}/${cardId}`)
    .set(as)
    .send({ title: 'Renamed' })
    .expect(200);
  await request(app)
    .post(`${paths.cards}/${cardId}/comments`)
    .set(as)
    .send({ content: 'Hi' })
    .expect(201);
  return { owner, workspaceId, boardId, cardId, otherCardId };
}

const feedOf = (boardId: string) => `${paths.boards}/${boardId}/activities`;

describe('GET /api/v1/boards/:boardId/activities', () => {
  it('200: the whole board, newest first, with each actor', async () => {
    const { owner, boardId, cardId } = await busyBoard();

    const res = await request(app).get(feedOf(boardId)).set(bearer(owner.token)).expect(200);

    const page = ActivitiesPageSchema.parse(res.body);
    expect(page.data.map((a) => a.type)).toEqual([
      'COMMENT_ADDED',
      'CARD_UPDATED',
      'CARD_CREATED',
      'CARD_CREATED',
      'LIST_CREATED',
      'BOARD_CREATED',
    ]);
    expect(page.nextCursor).toBeNull();
    expect(page.data[0]).toMatchObject({
      cardId,
      user: { id: owner.user.id, name: owner.user.name, avatarUrl: null },
    });
    expect(page.data[1]!.data).toEqual({ title: 'Renamed' });
    expect(page.data.at(-1)!.cardId).toBeNull();
  });

  it('200: with cardId, only that card’s entries', async () => {
    const { owner, boardId, cardId } = await busyBoard();

    const res = await request(app)
      .get(feedOf(boardId))
      .query({ cardId })
      .set(bearer(owner.token))
      .expect(200);

    const page = ActivitiesPageSchema.parse(res.body);
    expect(page.data.map((a) => a.type)).toEqual(['COMMENT_ADDED', 'CARD_UPDATED', 'CARD_CREATED']);
    expect(page.data.every((a) => a.cardId === cardId)).toBe(true);
  });

  it('200: page by page with nextCursor, also under a card filter', async () => {
    const { owner, boardId, cardId } = await busyBoard();

    for (const [filter, total] of [
      [{}, 6],
      [{ cardId }, 3],
    ] as const) {
      const ids: string[] = [];
      let cursor: string | null | undefined;
      do {
        const res = await request(app)
          .get(feedOf(boardId))
          .query({ ...filter, limit: 2, ...(cursor && { cursor }) })
          .set(bearer(owner.token))
          .expect(200);
        const page = ActivitiesPageSchema.parse(res.body);
        ids.push(...page.data.map((a) => a.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(ids).toHaveLength(total);
      expect(new Set(ids).size).toBe(total);
    }
  });

  it('404 for a card on another board, or one nothing has', async () => {
    const { owner, workspaceId, boardId } = await busyBoard();
    const elsewhere = await request(app)
      .post(`${paths.workspaces}/${workspaceId}/boards`)
      .set(bearer(owner.token))
      .send({ title: 'Other' })
      .expect(201);
    const otherList = await request(app)
      .post(`${paths.boards}/${elsewhere.body.data.id as string}/lists`)
      .set(bearer(owner.token))
      .send({ title: 'L' })
      .expect(201);
    const otherCard = await request(app)
      .post(`${paths.lists}/${otherList.body.data.id as string}/cards`)
      .set(bearer(owner.token))
      .send({ title: 'C' })
      .expect(201);

    for (const cardId of [otherCard.body.data.id as string, cardData.unknownCardId]) {
      const res = await request(app)
        .get(feedOf(boardId))
        .query({ cardId })
        .set(bearer(owner.token));
      expect(res.status).toBe(404);
      expect(ErrorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
    }
  });

  it.each([
    { case: 'a malformed cardId', query: { cardId: 'not-a-cuid' } },
    { case: 'a malformed cursor', query: { cursor: 'not-a-cuid' } },
    { case: 'a cursor nothing has', query: { cursor: cardData.unknownCardId } },
    { case: 'a limit over 100', query: { limit: 101 } },
  ])('400 for $case', async ({ query }) => {
    const { owner, boardId } = await busyBoard();

    const res = await request(app).get(feedOf(boardId)).query(query).set(bearer(owner.token));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400 for a cursor outside the feed asked for (another card’s entry)', async () => {
    const { owner, boardId, cardId, otherCardId } = await busyBoard();
    const other = await testPrisma.activity.findFirstOrThrow({ where: { cardId: otherCardId } });

    const res = await request(app)
      .get(feedOf(boardId))
      .query({ cardId, cursor: other.id })
      .set(bearer(owner.token));

    expect(res.status).toBe(400);
  });

  it('401 without a token', async () => {
    const { boardId } = await busyBoard();

    await request(app).get(feedOf(boardId)).expect(401);
  });
});
