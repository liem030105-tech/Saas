import {
  BoardDetailDtoSchema,
  CardDetailDtoSchema,
  ChecklistDtoSchema,
  ChecklistItemDtoSchema,
  ErrorResponseSchema,
} from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { cardData } from '../data/cards';
import { paths } from '../data/http';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Express } from 'express';

// CARD-005c: docs/api/cards.md → Checklists. The role matrix and tenant isolation of these routes
// run in their own suites.

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

/** A card on a fresh board owned by a new user. */
async function card() {
  const owner = await createUserWithToken();
  const created = await request(app)
    .post(paths.workspaces)
    .set(bearer(owner.token))
    .send({ name: cardData.workspaceName })
    .expect(201);
  const board = await request(app)
    .post(`${paths.workspaces}/${created.body.data.id as string}/boards`)
    .set(bearer(owner.token))
    .send({ title: cardData.boardTitle })
    .expect(201);
  const boardId = board.body.data.id as string;
  const list = await request(app)
    .post(`${paths.boards}/${boardId}/lists`)
    .set(bearer(owner.token))
    .send({ title: cardData.listTitle })
    .expect(201);
  const added = await request(app)
    .post(`${paths.lists}/${list.body.data.id as string}/cards`)
    .set(bearer(owner.token))
    .send({ title: cardData.titles[0] })
    .expect(201);
  return { owner, boardId, cardId: added.body.data.id as string };
}

const checklistsOf = (cardId: string) => `${paths.cards}/${cardId}/checklists`;
const checklistPath = (checklistId: string) => `${paths.checklists}/${checklistId}`;
const itemsOf = (checklistId: string) => `${checklistPath(checklistId)}/items`;

async function addChecklist(user: User, cardId: string, title: string) {
  const res = await request(app)
    .post(checklistsOf(cardId))
    .set(bearer(user.token))
    .send({ title })
    .expect(201);
  return ChecklistDtoSchema.parse(res.body.data);
}

async function addItem(user: User, checklistId: string, content: string) {
  const res = await request(app)
    .post(itemsOf(checklistId))
    .set(bearer(user.token))
    .send({ content })
    .expect(201);
  return ChecklistItemDtoSchema.parse(res.body.data);
}

const cardDetail = async (cardId: string, user: User) =>
  CardDetailDtoSchema.parse(
    (await request(app).get(`${paths.cards}/${cardId}`).set(bearer(user.token)).expect(200)).body
      .data,
  );

describe('checklists', () => {
  it('201: checklists and items are appended in order, trimmed, and show on the card', async () => {
    const { owner, cardId } = await card();

    const launch = await addChecklist(owner, cardId, '  Launch ');
    const qa = await addChecklist(owner, cardId, 'QA');
    const first = await addItem(owner, launch.id, ' Write docs ');
    const second = await addItem(owner, launch.id, 'Ship');

    expect(launch).toMatchObject({ title: 'Launch', items: [] });
    expect(qa.position).toBeGreaterThan(launch.position);
    expect(first).toMatchObject({ content: 'Write docs', done: false });
    expect(second.position).toBeGreaterThan(first.position);
    const detail = await cardDetail(cardId, owner);
    expect(detail.checklists.map((checklist) => checklist.title)).toEqual(['Launch', 'QA']);
    expect(detail.checklists[0]!.items.map((item) => item.content)).toEqual(['Write docs', 'Ship']);
  });

  it('200: ticking items updates the progress on the card and on the board tile', async () => {
    const { owner, boardId, cardId } = await card();
    const launch = await addChecklist(owner, cardId, 'Launch');
    const docs = await addItem(owner, launch.id, 'Docs');
    await addItem(owner, launch.id, 'Ship');
    const qa = await addChecklist(owner, cardId, 'QA');
    await addItem(owner, qa.id, 'Test');

    const res = await request(app)
      .patch(`${itemsOf(launch.id)}/${docs.id}`)
      .set(bearer(owner.token))
      .send({ done: true })
      .expect(200);

    expect(res.body.data).toMatchObject({ id: docs.id, done: true });
    const board = BoardDetailDtoSchema.parse(
      (await request(app).get(`${paths.boards}/${boardId}`).set(bearer(owner.token))).body.data,
    );
    expect(board.lists[0]!.cards[0]!.checklist).toEqual({ done: 1, total: 3 });
    expect((await cardDetail(cardId, owner)).checklist).toEqual({ done: 1, total: 3 });
  });

  it('200: renames and reorders checklists and items by position', async () => {
    const { owner, cardId } = await card();
    const a = await addChecklist(owner, cardId, 'A');
    const b = await addChecklist(owner, cardId, 'B');
    const one = await addItem(owner, a.id, 'One');
    const two = await addItem(owner, a.id, 'Two');

    await request(app)
      .patch(checklistPath(b.id))
      .set(bearer(owner.token))
      .send({ title: 'B first', position: a.position / 2 })
      .expect(200);
    await request(app)
      .patch(`${itemsOf(a.id)}/${two.id}`)
      .set(bearer(owner.token))
      .send({ content: 'Two first', position: one.position / 2 })
      .expect(200);

    const detail = await cardDetail(cardId, owner);
    expect(detail.checklists.map((checklist) => checklist.title)).toEqual(['B first', 'A']);
    expect(detail.checklists[1]!.items.map((item) => item.content)).toEqual(['Two first', 'One']);
  });

  it.each([
    { kind: 'items', table: 'ChecklistItem' },
    { kind: 'checklists', table: 'Checklist' },
  ])('a move into a too-small gap renumbers the $kind and keeps the order', async ({ kind }) => {
    const { owner, cardId } = await card();
    const host = await addChecklist(owner, cardId, 'Host');
    const add = (title: string) =>
      kind === 'items' ? addItem(owner, host.id, title) : addChecklist(owner, cardId, title);
    const first = await add('First');
    const second = await add('Second');
    const third = await add('Third');
    const pathOf = (id: string) =>
      kind === 'items' ? `${itemsOf(host.id)}/${id}` : checklistPath(id);

    // Third goes between First and Second, closer to First than the rebalance threshold.
    const res = await request(app)
      .patch(pathOf(third.id))
      .set(bearer(owner.token))
      .send({ position: first.position + 1e-7 });

    expect(res.status).toBe(200);
    const detail = await cardDetail(cardId, owner);
    const rows =
      kind === 'items'
        ? detail.checklists[0]!.items.map((item) => [item.content, item.position])
        : detail.checklists.slice(1).map((checklist) => [checklist.title, checklist.position]);
    expect(rows.map(([name]) => name)).toEqual(['First', 'Third', 'Second']);
    expect(rows.every(([, position]) => (position as number) % 1024 === 0)).toBe(true);
    expect(res.body.data.position).toBe(rows[1]![1]);
    expect(second.position).not.toBe(rows[2]![1]);
  });

  it('204: deleting an item, then a checklist with its items', async () => {
    const { owner, cardId } = await card();
    const launch = await addChecklist(owner, cardId, 'Launch');
    const docs = await addItem(owner, launch.id, 'Docs');
    await addItem(owner, launch.id, 'Ship');

    await request(app)
      .delete(`${itemsOf(launch.id)}/${docs.id}`)
      .set(bearer(owner.token))
      .expect(204);
    expect((await cardDetail(cardId, owner)).checklists[0]!.items).toHaveLength(1);
    await request(app).delete(checklistPath(launch.id)).set(bearer(owner.token)).expect(204);

    expect((await cardDetail(cardId, owner)).checklists).toEqual([]);
    expect(await testPrisma.checklistItem.count({ where: { checklistId: launch.id } })).toBe(0);
  });

  it('404 for an item addressed through another checklist, even on the same card', async () => {
    const { owner, cardId } = await card();
    const a = await addChecklist(owner, cardId, 'A');
    const b = await addChecklist(owner, cardId, 'B');
    const item = await addItem(owner, a.id, 'One');

    const patched = await request(app)
      .patch(`${itemsOf(b.id)}/${item.id}`)
      .set(bearer(owner.token))
      .send({ done: true });
    const deleted = await request(app)
      .delete(`${itemsOf(b.id)}/${item.id}`)
      .set(bearer(owner.token));

    expect([patched.status, deleted.status]).toEqual([404, 404]);
    expect(await testPrisma.checklistItem.findUnique({ where: { id: item.id } })).toMatchObject({
      done: false,
    });
  });

  it.each([
    { case: 'a blank checklist title', path: 'checklist', body: { title: '   ' } },
    {
      case: 'a checklist title over 100 chars',
      path: 'checklist',
      body: { title: 't'.repeat(101) },
    },
    { case: 'an empty checklist update', path: 'update', body: {} },
    { case: 'a blank item', path: 'item', body: { content: '' } },
    { case: 'an item over 500 chars', path: 'item', body: { content: 'c'.repeat(501) } },
    { case: 'a non-boolean done', path: 'updateItem', body: { done: 'yes' } },
    { case: 'a checklist position of 0', path: 'update', body: { position: 0 } },
    { case: 'an item position of 0', path: 'updateItem', body: { position: 0 } },
  ])('400 for $case', async ({ path, body }) => {
    const { owner, cardId } = await card();
    const launch = await addChecklist(owner, cardId, 'Launch');
    const item = await addItem(owner, launch.id, 'Docs');
    const send = {
      checklist: () => request(app).post(checklistsOf(cardId)),
      update: () => request(app).patch(checklistPath(launch.id)),
      item: () => request(app).post(itemsOf(launch.id)),
      updateItem: () => request(app).patch(`${itemsOf(launch.id)}/${item.id}`),
    }[path]!;

    const res = await send().set(bearer(owner.token)).send(body);

    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('401 without a token on every route', async () => {
    const { owner, cardId } = await card();
    const launch = await addChecklist(owner, cardId, 'Launch');
    const item = await addItem(owner, launch.id, 'Docs');
    const itemPath = `${itemsOf(launch.id)}/${item.id}`;

    const statuses = await Promise.all([
      request(app).post(checklistsOf(cardId)).send({ title: 'X' }),
      request(app).patch(checklistPath(launch.id)).send({ title: 'X' }),
      request(app).delete(checklistPath(launch.id)),
      request(app).post(itemsOf(launch.id)).send({ content: 'X' }),
      request(app).patch(itemPath).send({ done: true }),
      request(app).delete(itemPath),
    ]);

    expect(statuses.map((res) => res.status)).toEqual([401, 401, 401, 401, 401, 401]);
  });

  it('404 for a checklist id nothing has, or one that is malformed', async () => {
    const { owner } = await card();

    for (const id of [cardData.unknownCardId, 'not-a-cuid']) {
      const res = await request(app)
        .post(itemsOf(id))
        .set(bearer(owner.token))
        .send({ content: 'X' });
      expect(res.status).toBe(404);
    }
  });
});
