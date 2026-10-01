import {
  BoardDetailDtoSchema,
  CardDetailDtoSchema,
  ErrorResponseSchema,
  LabelDtoSchema,
} from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { cardData } from '../data/cards';
import { paths } from '../data/http';
import { invalidLabelBodies, invalidLabelUpdates, labelData } from '../data/labels';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Express } from 'express';

// CARD-005a: docs/api/boards.md → Labels and docs/api/cards.md → Card members & labels. The role
// matrix and tenant isolation of these routes run in their own suites.

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

/** A board created through the API by `owner` in `workspaceId`, with one list and one card. */
async function boardIn(owner: User, workspaceId: string) {
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
  const listId = list.body.data.id as string;
  const card = await request(app)
    .post(`${paths.lists}/${listId}/cards`)
    .set(bearer(owner.token))
    .send({ title: cardData.titles[0] })
    .expect(201);
  const labels = await testPrisma.label.findMany({ where: { boardId }, orderBy: { id: 'asc' } });
  return {
    boardId,
    listId,
    cardId: card.body.data.id as string,
    labelIds: labels.map((l) => l.id),
  };
}

/** A workspace of a new owner with one board (see boardIn). */
async function workspace() {
  const owner = await createUserWithToken();
  const created = await request(app)
    .post(paths.workspaces)
    .set(bearer(owner.token))
    .send({ name: cardData.workspaceName })
    .expect(201);
  const workspaceId = created.body.data.id as string;
  return { owner, workspaceId, ...(await boardIn(owner, workspaceId)) };
}

type Fixture = Awaited<ReturnType<typeof workspace>>;

const labelsPath = (boardId: string) => `${paths.boards}/${boardId}/labels`;
const cardLabelPath = (cardId: string, labelId: string) =>
  `${paths.cards}/${cardId}/labels/${labelId}`;

const cardDetail = async (cardId: string, user: User) =>
  CardDetailDtoSchema.parse(
    (await request(app).get(`${paths.cards}/${cardId}`).set(bearer(user.token)).expect(200)).body
      .data,
  );

const boardDetail = async (boardId: string, user: User) =>
  BoardDetailDtoSchema.parse(
    (await request(app).get(`${paths.boards}/${boardId}`).set(bearer(user.token)).expect(200)).body
      .data,
  );

describe('default labels', () => {
  it('a new board starts with six colour-only labels, listed in order by GET and the board', async () => {
    const { owner, boardId } = await workspace();

    const res = await request(app).get(labelsPath(boardId)).set(bearer(owner.token)).expect(200);

    const labels = LabelDtoSchema.array().parse(res.body.data);
    expect(labels.map((label) => label.color)).toEqual(labelData.defaults);
    expect(labels.every((label) => label.name === '' && label.boardId === boardId)).toBe(true);
    expect((await boardDetail(boardId, owner)).labels).toEqual(labels);
  });
});

describe('401 without a token', () => {
  it.each([
    {
      route: 'GET /boards/:boardId/labels',
      send: (f: Fixture) => request(app).get(labelsPath(f.boardId)),
    },
    {
      route: 'PATCH /labels/:labelId',
      send: (f: Fixture) =>
        request(app).patch(`${paths.labels}/${f.labelIds[0]}`).send({ name: 'Bug' }),
    },
    {
      route: 'DELETE /labels/:labelId',
      send: (f: Fixture) => request(app).delete(`${paths.labels}/${f.labelIds[0]}`),
    },
  ])('$route', async ({ send }) => {
    const fixture = await workspace();

    const res = await send(fixture);

    expect(res.status).toBe(401);
    expect(await testPrisma.label.count({ where: { boardId: fixture.boardId } })).toBe(6);
  });
});

describe('POST /api/v1/boards/:boardId/labels', () => {
  it.each([
    { case: 'named', given: labelData.create },
    { case: 'colour-only', given: labelData.colourOnly },
  ])('201: a $case label is added after the defaults', async ({ given }) => {
    const { owner, boardId } = await workspace();

    const res = await request(app)
      .post(labelsPath(boardId))
      .set(bearer(owner.token))
      .send(given.input)
      .expect(201);

    expect(LabelDtoSchema.parse(res.body.data)).toMatchObject({ boardId, ...given.stored });
    const all = (await request(app).get(labelsPath(boardId)).set(bearer(owner.token))).body.data;
    expect(all.at(-1).id).toBe(res.body.data.id);
  });

  it.each(invalidLabelBodies)('400: $case', async ({ body }) => {
    const { owner, boardId } = await workspace();

    const res = await request(app).post(labelsPath(boardId)).set(bearer(owner.token)).send(body);

    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('401 without a token', async () => {
    const { boardId } = await workspace();

    const res = await request(app).post(labelsPath(boardId)).send(labelData.create.input);

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/labels/:labelId', () => {
  it('200: renames and recolours; the card that carries it follows', async () => {
    const { owner, cardId, labelIds } = await workspace();
    await request(app).post(cardLabelPath(cardId, labelIds[0]!)).set(bearer(owner.token));

    const res = await request(app)
      .patch(`${paths.labels}/${labelIds[0]}`)
      .set(bearer(owner.token))
      .send(labelData.update.input)
      .expect(200);

    expect(res.body.data).toMatchObject(labelData.update.stored);
    expect((await cardDetail(cardId, owner)).labels).toEqual([res.body.data]);
  });

  it.each(invalidLabelUpdates)('400: $case', async ({ body }) => {
    const { owner, labelIds } = await workspace();

    const res = await request(app)
      .patch(`${paths.labels}/${labelIds[0]}`)
      .set(bearer(owner.token))
      .send(body);

    expect(res.status).toBe(400);
  });

  it.each([labelData.unknownLabelId, labelData.malformedLabelId])('404 for %s', async (id) => {
    const { owner } = await workspace();

    const res = await request(app)
      .patch(`${paths.labels}/${id}`)
      .set(bearer(owner.token))
      .send({ name: 'Bug' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/labels/:labelId', () => {
  it('204: the label leaves the board and every card that carried it', async () => {
    const { owner, boardId, cardId, labelIds } = await workspace();
    await request(app).post(cardLabelPath(cardId, labelIds[0]!)).set(bearer(owner.token));

    await request(app)
      .delete(`${paths.labels}/${labelIds[0]}`)
      .set(bearer(owner.token))
      .expect(204);

    const board = await boardDetail(boardId, owner);
    expect(board.labels.map((label) => label.id)).toEqual(labelIds.slice(1));
    expect(board.lists[0]!.cards[0]!.labelIds).toEqual([]);
    const again = await request(app)
      .delete(`${paths.labels}/${labelIds[0]}`)
      .set(bearer(owner.token));
    expect(again.status).toBe(404);
  });
});

describe('POST and DELETE /api/v1/cards/:cardId/labels/:labelId', () => {
  it('204: attaching is idempotent and shows on the card and on the board tile; detaching too', async () => {
    const { owner, boardId, cardId, labelIds } = await workspace();
    const [first, second] = labelIds;

    for (const labelId of [second!, first!, second!]) {
      await request(app).post(cardLabelPath(cardId, labelId)).set(bearer(owner.token)).expect(204);
    }

    expect((await cardDetail(cardId, owner)).labels.map((label) => label.id)).toEqual(
      [first, second].sort(),
    );
    const tile = (await boardDetail(boardId, owner)).lists[0]!.cards[0]!;
    expect(tile.labelIds).toEqual([first, second].sort());

    for (let i = 0; i < 2; i += 1) {
      await request(app).delete(cardLabelPath(cardId, first!)).set(bearer(owner.token)).expect(204);
    }
    expect((await cardDetail(cardId, owner)).labels.map((label) => label.id)).toEqual([second]);
  });

  it('logs LABEL_ADDED and LABEL_REMOVED once per real change, with the label as it was', async () => {
    const { owner, cardId, labelIds } = await workspace();
    const labelId = labelIds[0]!;
    await request(app)
      .patch(`${paths.labels}/${labelId}`)
      .set(bearer(owner.token))
      .send({ name: 'Urgent' })
      .expect(200);

    for (let i = 0; i < 2; i += 1) {
      await request(app).post(cardLabelPath(cardId, labelId)).set(bearer(owner.token)).expect(204);
    }
    for (let i = 0; i < 2; i += 1) {
      await request(app)
        .delete(cardLabelPath(cardId, labelId))
        .set(bearer(owner.token))
        .expect(204);
    }

    const logged = await testPrisma.activity.findMany({
      where: { cardId, type: { in: ['LABEL_ADDED', 'LABEL_REMOVED'] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const label = { labelId, name: 'Urgent', color: '#61bd4f' };
    expect(logged.map(({ type, data, userId }) => ({ type, data, userId }))).toEqual([
      { type: 'LABEL_ADDED', data: label, userId: owner.user.id },
      { type: 'LABEL_REMOVED', data: label, userId: owner.user.id },
    ]);
  });

  it('422 LABEL_OTHER_BOARD for a visible label of another board; the card keeps its labels', async () => {
    const { owner, workspaceId, cardId } = await workspace();
    const other = await boardIn(owner, workspaceId);

    const res = await request(app)
      .post(cardLabelPath(cardId, other.labelIds[0]!))
      .set(bearer(owner.token));

    expect(res.status).toBe(422);
    expect(res.body.error.details[0].rule).toBe('LABEL_OTHER_BOARD');
    expect((await cardDetail(cardId, owner)).labels).toEqual([]);
  });

  it.each([labelData.unknownLabelId, labelData.malformedLabelId])(
    '404 for the label %s',
    async (labelId) => {
      const { owner, cardId } = await workspace();

      const res = await request(app).post(cardLabelPath(cardId, labelId)).set(bearer(owner.token));

      expect(res.status).toBe(404);
    },
  );

  it('401 without a token', async () => {
    const { cardId, labelIds } = await workspace();

    expect((await request(app).post(cardLabelPath(cardId, labelIds[0]!))).status).toBe(401);
    expect((await request(app).delete(cardLabelPath(cardId, labelIds[0]!))).status).toBe(401);
  });
});

describe('labels and card moves (I2)', () => {
  it("moving to another board drops the old board's labels; a move within the board keeps them", async () => {
    const { owner, workspaceId, cardId, listId, labelIds } = await workspace();
    const other = await boardIn(owner, workspaceId);
    await request(app).post(cardLabelPath(cardId, labelIds[0]!)).set(bearer(owner.token));

    await request(app)
      .patch(`${paths.cards}/${cardId}/move`)
      .set(bearer(owner.token))
      .send({ listId, position: 4096 })
      .expect(200);
    expect((await cardDetail(cardId, owner)).labels.map((label) => label.id)).toEqual([
      labelIds[0],
    ]);

    await request(app)
      .patch(`${paths.cards}/${cardId}/move`)
      .set(bearer(owner.token))
      .send({ listId: other.listId, position: 4096 })
      .expect(200);
    expect((await cardDetail(cardId, owner)).labels).toEqual([]);
    expect(await testPrisma.label.count({ where: { id: labelIds[0] } })).toBe(1);
  });

  it('a detach racing a card delete waits for it instead of deadlocking', async () => {
    const { owner, cardId, labelIds } = await workspace();
    await request(app)
      .post(cardLabelPath(cardId, labelIds[0]!))
      .set(bearer(owner.token))
      .expect(204);
    let detach: Promise<request.Response> | undefined;

    // Like a card delete: the card row first, then (the cascade) its label rows.
    await testPrisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "Card" WHERE "id" = ${cardId} FOR UPDATE`;
        detach = request(app)
          .delete(cardLabelPath(cardId, labelIds[0]!))
          .set(bearer(owner.token))
          .then((res) => res);
        await waitForLockWait();
        await tx.$queryRaw`SELECT 1 FROM "CardLabel" WHERE "cardId" = ${cardId} FOR UPDATE`;
      },
      { timeout: 20_000 },
    );

    expect((await detach!).status).toBe(204);
    expect(await testPrisma.activity.count({ where: { cardId, type: 'LABEL_REMOVED' } })).toBe(1);
  });

  it('an attach racing a move to another board waits for it, then refuses the old label', async () => {
    const { owner, workspaceId, cardId, labelIds } = await workspace();
    const other = await boardIn(owner, workspaceId);
    let attach: Promise<request.Response> | undefined;

    // The move holds the card row (as cards.repository.move does) while the attach comes in.
    await testPrisma.$transaction(
      async (tx) => {
        await tx.card.update({
          where: { id: cardId },
          data: { listId: other.listId, boardId: other.boardId },
        });
        attach = request(app)
          .post(cardLabelPath(cardId, labelIds[0]!))
          .set(bearer(owner.token))
          .then((res) => res);
        // Without the lock the attach would not wait, and answers before the move commits.
        await Promise.race([waitForLockWait(), attach]);
      },
      { timeout: 20_000 },
    );

    const res = await attach!;
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].rule).toBe('LABEL_OTHER_BOARD');
    expect(await testPrisma.cardLabel.count({ where: { cardId } })).toBe(0);
  });
});

/** Resolves once some query waits on a row lock (the attach, blocked by the open move). */
async function waitForLockWait() {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const [row] = await testPrisma.$queryRaw<{ waiting: bigint }[]>`
      SELECT count(*) AS waiting FROM pg_stat_activity WHERE wait_event_type = 'Lock'`;
    if (row && row.waiting > 0n) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The attach never waited for the move');
}
