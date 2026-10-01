import {
  BoardDetailDtoSchema,
  CardDetailDtoSchema,
  CommentDtoSchema,
  CommentsPageSchema,
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

import type { Role } from '@trello-clone/shared';
import type { Express } from 'express';

// CARD-005d: docs/api/cards.md → Comments and the permission matrix's comment rows. The role
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

/** A card on a fresh board owned by a new user; `as(role)` adds a member with that role. */
async function card() {
  const owner = await createUserWithToken();
  const created = await request(app)
    .post(paths.workspaces)
    .set(bearer(owner.token))
    .send({ name: cardData.workspaceName })
    .expect(201);
  const workspaceId = created.body.data.id as string;
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
  const added = await request(app)
    .post(`${paths.lists}/${list.body.data.id as string}/cards`)
    .set(bearer(owner.token))
    .send({ title: cardData.titles[0] })
    .expect(201);
  const as = async (role: Role) => {
    const user = await createUserWithToken();
    await testPrisma.workspaceMember.create({
      data: { userId: user.user.id, workspaceId, role },
    });
    return user;
  };
  return { owner, workspaceId, boardId, cardId: added.body.data.id as string, as };
}

const commentsOf = (cardId: string) => `${paths.cards}/${cardId}/comments`;
const commentPath = (commentId: string) => `${paths.comments}/${commentId}`;

async function comment(user: User, cardId: string, content: string) {
  const res = await request(app)
    .post(commentsOf(cardId))
    .set(bearer(user.token))
    .send({ content })
    .expect(201);
  return CommentDtoSchema.parse(res.body.data);
}

describe('POST /api/v1/cards/:cardId/comments', () => {
  it('201: stores the trimmed markdown, logs COMMENT_ADDED, and counts on the card and tile', async () => {
    const { owner, boardId, cardId } = await card();

    const created = await comment(owner, cardId, '  **Looks good** \n');

    expect(created).toMatchObject({
      cardId,
      content: '**Looks good**',
      author: { id: owner.user.id, name: owner.user.name, avatarUrl: null },
    });
    const activity = await testPrisma.activity.findFirst({ where: { type: 'COMMENT_ADDED' } });
    expect(activity).toMatchObject({
      cardId,
      userId: owner.user.id,
      data: { commentId: created.id },
    });
    const board = BoardDetailDtoSchema.parse(
      (await request(app).get(`${paths.boards}/${boardId}`).set(bearer(owner.token))).body.data,
    );
    expect(board.lists[0]!.cards[0]!.commentCount).toBe(1);
    const detail = CardDetailDtoSchema.parse(
      (await request(app).get(`${paths.cards}/${cardId}`).set(bearer(owner.token))).body.data,
    );
    expect(detail.commentCount).toBe(1);
  });

  it.each([{ content: '   ' }, { content: 'c'.repeat(5001) }, {}])('400 for %j', async (body) => {
    const { owner, cardId } = await card();

    const res = await request(app).post(commentsOf(cardId)).set(bearer(owner.token)).send(body);

    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/cards/:cardId/comments', () => {
  it('200: newest first, page by page with nextCursor, null at the end', async () => {
    const { owner, cardId, as } = await card();
    const viewer = await as('VIEWER');
    for (const text of ['one', 'two', 'three', 'four', 'five']) await comment(owner, cardId, text);

    const pages: string[][] = [];
    let cursor: string | null | undefined;
    do {
      const res = await request(app)
        .get(commentsOf(cardId))
        .query({ limit: 2, ...(cursor && { cursor }) })
        .set(bearer(viewer.token))
        .expect(200);
      const page = CommentsPageSchema.parse(res.body);
      pages.push(page.data.map((c) => c.content));
      cursor = page.nextCursor;
    } while (cursor);

    expect(pages).toEqual([['five', 'four'], ['three', 'two'], ['one']]);
  });

  it('200: an empty card answers an empty page', async () => {
    const { owner, cardId } = await card();

    const res = await request(app).get(commentsOf(cardId)).set(bearer(owner.token)).expect(200);

    expect(res.body).toEqual({ data: [], nextCursor: null });
  });

  it.each([
    { case: 'a cursor of another card', query: 'other' },
    { case: 'a cursor nothing has', query: cardData.unknownCardId },
    { case: 'a malformed cursor', query: 'not-a-cuid' },
    { case: 'a limit over 100', query: 'limit' },
  ])('400 for $case', async ({ query }) => {
    const { owner, cardId } = await card();
    const other = await card();
    const elsewhere = await comment(other.owner, other.cardId, 'elsewhere');
    const params =
      query === 'limit' ? { limit: 101 } : { cursor: query === 'other' ? elsewhere.id : query };

    const res = await request(app).get(commentsOf(cardId)).query(params).set(bearer(owner.token));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH and DELETE /api/v1/comments/:commentId', () => {
  it('200: the author edits their comment; updatedAt moves on', async () => {
    const { cardId, as } = await card();
    const member = await as('MEMBER');
    const mine = await comment(member, cardId, 'Frist');

    const res = await request(app)
      .patch(commentPath(mine.id))
      .set(bearer(member.token))
      .send({ content: ' First ' })
      .expect(200);

    const edited = CommentDtoSchema.parse(res.body.data);
    expect(edited.content).toBe('First');
    expect(Date.parse(edited.updatedAt)).toBeGreaterThanOrEqual(Date.parse(mine.updatedAt));
  });

  it("403 for someone else's comment, even an OWNER's edit", async () => {
    const { owner, cardId, as } = await card();
    const member = await as('MEMBER');
    const mine = await comment(member, cardId, 'Mine');

    const edit = await request(app)
      .patch(commentPath(mine.id))
      .set(bearer(owner.token))
      .send({ content: 'Changed' });
    const otherMember = await as('MEMBER');
    const remove = await request(app).delete(commentPath(mine.id)).set(bearer(otherMember.token));

    expect([edit.status, remove.status]).toEqual([403, 403]);
    expect(await testPrisma.comment.findUnique({ where: { id: mine.id } })).toMatchObject({
      content: 'Mine',
    });
  });

  it("204: an ADMIN deletes another's comment; the author deletes their own", async () => {
    const { cardId, as } = await card();
    const admin = await as('ADMIN');
    const member = await as('MEMBER');
    const first = await comment(member, cardId, 'First');
    const second = await comment(member, cardId, 'Second');

    await request(app).delete(commentPath(first.id)).set(bearer(admin.token)).expect(204);
    await request(app).delete(commentPath(second.id)).set(bearer(member.token)).expect(204);

    expect(await testPrisma.comment.count({ where: { cardId } })).toBe(0);
  });

  it('403 for a VIEWER who wrote the comment before being demoted (edit and delete)', async () => {
    const { workspaceId, cardId, as } = await card();
    const member = await as('MEMBER');
    const mine = await comment(member, cardId, 'Before');
    await testPrisma.workspaceMember.update({
      where: { userId_workspaceId: { userId: member.user.id, workspaceId } },
      data: { role: 'VIEWER' },
    });

    const edit = await request(app)
      .patch(commentPath(mine.id))
      .set(bearer(member.token))
      .send({ content: 'After' });
    const remove = await request(app).delete(commentPath(mine.id)).set(bearer(member.token));

    expect([edit.status, remove.status]).toEqual([403, 403]);
  });

  it.each([cardData.unknownCardId, 'not-a-cuid'])('404 for the comment %s', async (id) => {
    const { owner } = await card();

    const res = await request(app).delete(commentPath(id)).set(bearer(owner.token));

    expect(res.status).toBe(404);
  });

  it('400 for blank content', async () => {
    const { owner, cardId } = await card();
    const mine = await comment(owner, cardId, 'Text');

    const res = await request(app)
      .patch(commentPath(mine.id))
      .set(bearer(owner.token))
      .send({ content: ' ' });

    expect(res.status).toBe(400);
  });
});

describe('401 without a token', () => {
  it('on every comment route', async () => {
    const { owner, cardId } = await card();
    const mine = await comment(owner, cardId, 'Text');

    const statuses = await Promise.all([
      request(app).get(commentsOf(cardId)),
      request(app).post(commentsOf(cardId)).send({ content: 'X' }),
      request(app).patch(commentPath(mine.id)).send({ content: 'X' }),
      request(app).delete(commentPath(mine.id)),
    ]);

    expect(statuses.map((res) => res.status)).toEqual([401, 401, 401, 401]);
  });
});
