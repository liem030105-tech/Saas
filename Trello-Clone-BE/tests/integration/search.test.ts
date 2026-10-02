import { CardSummaryDtoSchema, ErrorResponseSchema } from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { paths } from '../data/http';
import { searchData } from '../data/search';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Express } from 'express';

// SEARCH-001: docs/api/boards.md → GET /boards/:boardId/search. The role matrix and tenant
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

type CardKey = keyof typeof searchData.cards;

/**
 * A board with two lists: the `searchData.cards` spread over them (login and signup in the first,
 * in that order; the rest in the second), plus an archived card and a card in an archived list.
 * The login card has the board's first label and the owner as member.
 */
async function searchBoard() {
  const owner = await createUserWithToken();
  const as = bearer(owner.token);
  const ws = await request(app)
    .post(paths.workspaces)
    .set(as)
    .send({ name: searchData.workspaceName })
    .expect(201);
  const board = await request(app)
    .post(`${paths.workspaces}/${ws.body.data.id as string}/boards`)
    .set(as)
    .send({ title: searchData.boardTitle })
    .expect(201);
  const boardId = board.body.data.id as string;
  const listIds: string[] = [];
  for (const title of [...searchData.lists, 'Archived']) {
    const list = await request(app)
      .post(`${paths.boards}/${boardId}/lists`)
      .set(as)
      .send({ title })
      .expect(201);
    listIds.push(list.body.data.id as string);
  }
  const [first, second, archivedList] = listIds as [string, string, string];
  const ids = {} as Record<CardKey, string>;
  let position = 1024;
  for (const [key, card] of Object.entries(searchData.cards) as [
    CardKey,
    (typeof searchData.cards)[CardKey],
  ][]) {
    const created = await testPrisma.card.create({
      data: {
        boardId,
        listId: key === 'login' || key === 'signup' ? first : second,
        title: card.title,
        description: card.description,
        position: (position += 1024),
        dueDate: card.dueInDays === null ? null : searchData.dueDate(card.dueInDays),
        completed: 'completed' in card ? card.completed : false,
      },
    });
    ids[key] = created.id;
  }
  await testPrisma.card.create({
    data: {
      boardId,
      listId: first,
      title: searchData.hidden.archivedCard,
      position: 1,
      archived: true,
    },
  });
  await testPrisma.card.create({
    data: { boardId, listId: archivedList, title: searchData.hidden.archivedList, position: 1 },
  });
  await testPrisma.list.update({ where: { id: archivedList }, data: { archived: true } });
  const label = await testPrisma.label.findFirstOrThrow({
    where: { boardId },
    orderBy: { id: 'asc' },
  });
  await testPrisma.cardLabel.create({ data: { cardId: ids.login, labelId: label.id } });
  await testPrisma.cardMember.create({ data: { cardId: ids.signup, userId: owner.user.id } });
  return { owner, boardId, ids, labelId: label.id };
}

/** The card ids GET …/search answers for `query` (asserting a 200 of CardSummaryDtos). */
async function found(ctx: Awaited<ReturnType<typeof searchBoard>>, query: Record<string, string>) {
  const res = await request(app)
    .get(`${paths.boards}/${ctx.boardId}/search`)
    .query(query)
    .set(bearer(ctx.owner.token))
    .expect(200);
  return (res.body.data as unknown[]).map((card) => CardSummaryDtoSchema.parse(card).id);
}

describe('GET /api/v1/boards/:boardId/search', () => {
  it('200: no filter is every open card in board order; archived ones never show', async () => {
    const ctx = await searchBoard();
    const { ids } = ctx;

    expect(await found(ctx, {})).toEqual([
      ids.login,
      ids.signup,
      ids.percent,
      ids.underscore,
      ids.percentDecoy,
      ids.underscoreDecoy,
      ids.backslash,
      ids.done,
    ]);
  });

  it('q matches title or description, any case', async () => {
    const ctx = await searchBoard();
    const { ids } = ctx;

    expect(await found(ctx, { q: 'login' })).toEqual([ids.login, ids.signup, ids.done]);
    expect(await found(ctx, { q: 'nothing like it' })).toEqual([]);
  });

  it('q is taken literally: % and _ are not wildcards', async () => {
    const ctx = await searchBoard();
    const { ids } = ctx;
    const q = searchData.wildcardQueries;

    expect(await found(ctx, { q: q.percent })).toEqual([ids.percent]);
    expect(await found(ctx, { q: q.underscore })).toEqual([ids.underscore]);
    expect(await found(ctx, { q: q.literalPercent })).toEqual([ids.percent]);
    expect(await found(ctx, { q: q.literalUnderscore })).toEqual([ids.underscore]);
    expect(await found(ctx, { q: q.backslash })).toEqual([ids.backslash]);
  });

  it('labelId, memberId and each due filter', async () => {
    const ctx = await searchBoard();
    const { ids } = ctx;

    expect(await found(ctx, { labelId: ctx.labelId })).toEqual([ids.login]);
    expect(await found(ctx, { memberId: ctx.owner.user.id })).toEqual([ids.signup]);
    // Completed cards are neither overdue nor due this week.
    expect(await found(ctx, { due: 'overdue' })).toEqual([ids.login]);
    expect(await found(ctx, { due: 'week' })).toEqual([ids.signup]);
    expect(await found(ctx, { due: 'none' })).toEqual([ids.underscore]);
  });

  it('combined filters must all match', async () => {
    const ctx = await searchBoard();
    const { ids } = ctx;

    expect(await found(ctx, { q: 'login', labelId: ctx.labelId })).toEqual([ids.login]);
    expect(await found(ctx, { q: 'login', due: 'week' })).toEqual([ids.signup]);
    expect(await found(ctx, { q: 'login', memberId: ctx.owner.user.id, due: 'overdue' })).toEqual(
      [],
    );
  });

  it('at most 100 results', async () => {
    const ctx = await searchBoard();
    const listId = (await testPrisma.list.findFirstOrThrow({ where: { boardId: ctx.boardId } })).id;
    await testPrisma.card.createMany({
      data: Array.from({ length: 101 }, (_, i) => ({
        boardId: ctx.boardId,
        listId,
        title: `Bulk ${i}`,
        position: 100_000 + i,
      })),
    });

    expect(await found(ctx, { q: 'Bulk' })).toHaveLength(100);
  });

  it('400: an invalid filter', async () => {
    const ctx = await searchBoard();
    for (const query of [{ q: ' ' }, { due: 'soon' }, { labelId: 'not-a-cuid' }]) {
      const res = await request(app)
        .get(`${paths.boards}/${ctx.boardId}/search`)
        .query(query)
        .set(bearer(ctx.owner.token))
        .expect(400);
      expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('401 without a token', async () => {
    const ctx = await searchBoard();
    await request(app).get(`${paths.boards}/${ctx.boardId}/search`).expect(401);
  });
});
