import {
  AttachmentDtoSchema,
  BoardDetailDtoSchema,
  CardDetailDtoSchema,
  CardSummaryDtoSchema,
  ErrorResponseSchema,
} from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { attachmentData } from '../data/attachments';
import { paths } from '../data/http';
import { resetDb, testPrisma } from '../helpers/db';
import { installMemoryStorage, type MemoryStorage } from '../helpers/storage';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Express } from 'express';

// ATTACHMENTS-001: docs/api/cards.md → Attachments, with the bucket in memory (helpers/storage).
// The role matrix and tenant isolation of these routes run in their own suites.

let app: Express;
let storage: MemoryStorage;

beforeEach(async () => {
  await resetDb();
  app = createTestApp();
  storage = installMemoryStorage();
});
afterAll(async () => {
  await prisma.$disconnect();
  await testPrisma.$disconnect();
});

/** A workspace with a card; the owner and a MEMBER. */
async function cardWithMember() {
  const owner = await createUserWithToken();
  const member = await createUserWithToken();
  const ws = await request(app)
    .post(paths.workspaces)
    .set(bearer(owner.token))
    .send({ name: attachmentData.workspaceName })
    .expect(201);
  const workspaceId = ws.body.data.id as string;
  await testPrisma.workspaceMember.create({
    data: { userId: member.user.id, workspaceId, role: 'MEMBER' },
  });
  const board = await request(app)
    .post(`${paths.workspaces}/${workspaceId}/boards`)
    .set(bearer(owner.token))
    .send({ title: attachmentData.boardTitle })
    .expect(201);
  const list = await request(app)
    .post(`${paths.boards}/${board.body.data.id as string}/lists`)
    .set(bearer(owner.token))
    .send({ title: attachmentData.listTitle })
    .expect(201);
  const card = await request(app)
    .post(`${paths.lists}/${list.body.data.id as string}/cards`)
    .set(bearer(owner.token))
    .send({ title: attachmentData.cardTitle })
    .expect(201);
  return {
    owner,
    member,
    workspaceId,
    boardId: board.body.data.id as string,
    listId: list.body.data.id as string,
    cardId: card.body.data.id as string,
  };
}

const upload = (cardId: string, token: string, file: { name: string; bytes: Buffer }) =>
  request(app)
    .post(`${paths.cards}/${cardId}/attachments`)
    .set(bearer(token))
    .attach('file', file.bytes, file.name);

describe('POST /api/v1/cards/:cardId/attachments', () => {
  it('201: the file is stored under <workspace>/<card>/<uuid>, listed on the card, and logged', async () => {
    const { owner, member, workspaceId, cardId } = await cardWithMember();

    const res = await upload(cardId, member.token, attachmentData.png).expect(201);

    const dto = AttachmentDtoSchema.parse(res.body.data);
    expect(dto).toMatchObject({
      fileName: attachmentData.png.name,
      mimeType: attachmentData.png.mimeType,
      size: attachmentData.png.bytes.length,
      uploader: { id: member.user.id },
    });
    const row = await testPrisma.attachment.findUniqueOrThrow({ where: { id: dto.id } });
    expect(row.storageKey).toMatch(new RegExp(`^${workspaceId}/${cardId}/[0-9a-f-]{36}$`));
    expect(storage.objects.get(row.storageKey)).toEqual({
      body: attachmentData.png.bytes,
      contentType: attachmentData.png.mimeType,
    });
    // The URL is a signed one made from the key, never stored.
    expect(dto.url).toContain(row.storageKey);
    expect(
      await testPrisma.activity.findFirst({ where: { cardId, type: 'ATTACHMENT_ADDED' } }),
    ).toMatchObject({
      userId: member.user.id,
      data: { attachmentId: dto.id, fileName: dto.fileName },
    });

    const detail = await request(app)
      .get(`${paths.cards}/${cardId}`)
      .set(bearer(owner.token))
      .expect(200);
    expect(CardDetailDtoSchema.parse(detail.body.data).attachments).toEqual([dto]);
  });

  it('plain text without a signature is accepted; the name is sanitized', async () => {
    const { owner, cardId } = await cardWithMember();

    const text = await upload(cardId, owner.token, attachmentData.text).expect(201);
    expect(text.body.data.mimeType).toBe('text/plain');

    const unsafe = await upload(cardId, owner.token, {
      name: attachmentData.unsafeName.sent,
      bytes: attachmentData.png.bytes,
    }).expect(201);
    expect(unsafe.body.data.fileName).toBe(attachmentData.unsafeName.stored);

    // A UTF-8 name comes back as sent; bidirectional overrides are dropped.
    const vietnamese = await upload(cardId, owner.token, {
      name: attachmentData.unicodeName.sent,
      bytes: attachmentData.png.bytes,
    }).expect(201);
    expect(vietnamese.body.data.fileName).toBe(attachmentData.unicodeName.stored);
  });

  it('415: the type comes from the bytes, not the name (a renamed executable, a binary blob)', async () => {
    const { owner, cardId } = await cardWithMember();
    for (const file of [attachmentData.disguised, attachmentData.binary]) {
      const res = await upload(cardId, owner.token, file).expect(415);
      expect(ErrorResponseSchema.parse(res.body).error.code).toBe('UNSUPPORTED_FILE_TYPE');
    }
    expect(storage.objects.size).toBe(0);
    expect(await testPrisma.attachment.count()).toBe(0);
  });

  it('413: larger than 10 MB', async () => {
    const { owner, cardId } = await cardWithMember();
    const res = await upload(cardId, owner.token, {
      name: 'big.txt',
      bytes: Buffer.alloc(attachmentData.tooLargeBytes, 0x61),
    }).expect(413);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('FILE_TOO_LARGE');
    expect(storage.objects.size).toBe(0);
  });

  it('400 without a file; 401 without a token', async () => {
    const { owner, cardId } = await cardWithMember();
    const res = await request(app)
      .post(`${paths.cards}/${cardId}/attachments`)
      .set(bearer(owner.token))
      .expect(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    await request(app)
      .post(`${paths.cards}/${cardId}/attachments`)
      .attach('file', attachmentData.png.bytes, attachmentData.png.name)
      .expect(401);
  });

  it('storage down: 500 and nothing written', async () => {
    const { owner, cardId } = await cardWithMember();
    storage.failNext = 'put';
    await upload(cardId, owner.token, attachmentData.png).expect(500);
    expect(await testPrisma.attachment.count()).toBe(0);
  });
});

describe('DELETE /api/v1/attachments/:attachmentId', () => {
  it('its uploader (a MEMBER) deletes it: 204, the row and then the file are gone', async () => {
    const { member, cardId } = await cardWithMember();
    const created = await upload(cardId, member.token, attachmentData.png).expect(201);
    const { storageKey } = await testPrisma.attachment.findUniqueOrThrow({
      where: { id: created.body.data.id as string },
    });

    await request(app)
      .delete(`${paths.attachments}/${created.body.data.id as string}`)
      .set(bearer(member.token))
      .expect(204);

    expect(await testPrisma.attachment.count()).toBe(0);
    expect(storage.removed).toEqual([storageKey]);
  });

  it("a MEMBER cannot delete someone else's (403); a failed file delete still answers 204 (logged)", async () => {
    const { owner, member, cardId } = await cardWithMember();
    const created = await upload(cardId, owner.token, attachmentData.png).expect(201);
    const path = `${paths.attachments}/${created.body.data.id as string}`;

    await request(app).delete(path).set(bearer(member.token)).expect(403);
    expect(await testPrisma.attachment.count()).toBe(1);

    storage.failNext = 'remove'; // the retry succeeds
    await request(app).delete(path).set(bearer(owner.token)).expect(204);
    expect(await testPrisma.attachment.count()).toBe(0);
    expect(storage.removed).toHaveLength(1);
  });

  it('401 without a token (the attachment stays)', async () => {
    const { owner, cardId } = await cardWithMember();
    const created = await upload(cardId, owner.token, attachmentData.png).expect(201);
    await request(app)
      .delete(`${paths.attachments}/${created.body.data.id as string}`)
      .expect(401);
    expect(await testPrisma.attachment.count()).toBe(1);
  });

  it('404 for an unknown id', async () => {
    const { owner } = await cardWithMember();
    await request(app)
      .delete(`${paths.attachments}/clx0000000000000000000099`)
      .set(bearer(owner.token))
      .expect(404);
  });
});

describe('covers: PATCH /api/v1/cards/:cardId { coverAttachmentId }', () => {
  const patch = (cardId: string, token: string, coverAttachmentId: string | null) =>
    request(app).patch(`${paths.cards}/${cardId}`).set(bearer(token)).send({ coverAttachmentId });

  it('an image of the card becomes its cover: a signed coverUrl on the card, the board and search', async () => {
    const { owner, member, boardId, cardId } = await cardWithMember();
    const image = await upload(cardId, member.token, attachmentData.png).expect(201);
    const { storageKey } = await testPrisma.attachment.findUniqueOrThrow({
      where: { id: image.body.data.id as string },
    });

    const res = await patch(cardId, member.token, image.body.data.id as string).expect(200);
    const covered = CardDetailDtoSchema.parse(res.body.data);
    expect(covered.coverUrl).toContain(storageKey);
    expect(covered.coverAttachmentId).toBe(image.body.data.id);
    expect(
      await testPrisma.activity.findFirst({ where: { cardId, type: 'CARD_UPDATED' } }),
    ).toMatchObject({ data: { coverAttachmentId: image.body.data.id as string } });

    const board = await request(app)
      .get(`${paths.boards}/${boardId}`)
      .set(bearer(owner.token))
      .expect(200);
    const [tile] = BoardDetailDtoSchema.parse(board.body.data).lists[0]!.cards;
    expect(tile?.coverUrl).toContain(storageKey);
    const search = await request(app)
      .get(`${paths.boards}/${boardId}/search`)
      .set(bearer(owner.token))
      .expect(200);
    expect(CardSummaryDtoSchema.parse(search.body.data[0]).coverUrl).toContain(storageKey);

    // null removes the cover; the attachment stays.
    const cleared = await patch(cardId, member.token, null).expect(200);
    expect(cleared.body.data).toMatchObject({ coverUrl: null, coverAttachmentId: null });
    expect(await testPrisma.attachment.count()).toBe(1);
  });

  it("422: a non-image, another card's image, or an unknown id", async () => {
    const { owner, workspaceId, listId, cardId } = await cardWithMember();
    const text = await upload(cardId, owner.token, attachmentData.text).expect(201);
    const other = await request(app)
      .post(`${paths.lists}/${listId}/cards`)
      .set(bearer(owner.token))
      .send({ title: attachmentData.cardTitle })
      .expect(201);
    const otherImage = await upload(
      other.body.data.id as string,
      owner.token,
      attachmentData.png,
    ).expect(201);
    // An image in another workspace answers the same, so the id reveals nothing.
    const stranger = await cardWithMember();
    const foreign = await upload(stranger.cardId, stranger.owner.token, attachmentData.png).expect(
      201,
    );

    for (const id of [
      text.body.data.id as string,
      otherImage.body.data.id as string,
      foreign.body.data.id as string,
      'clx0000000000000000000099',
    ]) {
      const res = await patch(cardId, owner.token, id).expect(422);
      expect(ErrorResponseSchema.parse(res.body).error.details?.[0]).toMatchObject({
        rule: 'COVER_NOT_IMAGE_OF_CARD',
      });
    }
    expect(workspaceId).not.toBe(stranger.workspaceId);
    const card = await testPrisma.card.findUniqueOrThrow({ where: { id: cardId } });
    expect(card.coverAttachmentId).toBeNull();
  });

  it('deleting the cover attachment removes the cover', async () => {
    const { owner, cardId } = await cardWithMember();
    const image = await upload(cardId, owner.token, attachmentData.png).expect(201);
    await patch(cardId, owner.token, image.body.data.id as string).expect(200);

    await request(app)
      .delete(`${paths.attachments}/${image.body.data.id as string}`)
      .set(bearer(owner.token))
      .expect(204);

    const detail = await request(app)
      .get(`${paths.cards}/${cardId}`)
      .set(bearer(owner.token))
      .expect(200);
    expect(detail.body.data.coverUrl).toBeNull();
  });
});

describe('deleting a card, list, board or workspace removes its files from storage', () => {
  async function withFiles() {
    const ctx = await cardWithMember();
    const keys: string[] = [];
    for (const file of [attachmentData.png, attachmentData.text]) {
      const created = await upload(ctx.cardId, ctx.owner.token, file).expect(201);
      const row = await testPrisma.attachment.findUniqueOrThrow({
        where: { id: created.body.data.id as string },
      });
      keys.push(row.storageKey);
    }
    return { ...ctx, keys };
  }

  it.each([
    ['card', (c: Awaited<ReturnType<typeof withFiles>>) => `${paths.cards}/${c.cardId}`],
    ['list', (c: Awaited<ReturnType<typeof withFiles>>) => `${paths.lists}/${c.listId}`],
    ['board', (c: Awaited<ReturnType<typeof withFiles>>) => `${paths.boards}/${c.boardId}`],
    [
      'workspace',
      (c: Awaited<ReturnType<typeof withFiles>>) => `${paths.workspaces}/${c.workspaceId}`,
    ],
  ])('%s: 204, rows gone, every file removed', async (_name, path) => {
    const ctx = await withFiles();

    await request(app).delete(path(ctx)).set(bearer(ctx.owner.token)).expect(204);

    expect(await testPrisma.attachment.count()).toBe(0);
    expect([...storage.removed].sort()).toEqual([...ctx.keys].sort());
    expect(storage.objects.size).toBe(0);
  });

  it('a card moved into a list before the list is deleted takes its files along', async () => {
    const ctx = await withFiles();
    const empty = await request(app)
      .post(`${paths.boards}/${ctx.boardId}/lists`)
      .set(bearer(ctx.owner.token))
      .send({ title: attachmentData.listTitle })
      .expect(201);
    const emptyId = empty.body.data.id as string;
    await request(app)
      .patch(`${paths.cards}/${ctx.cardId}/move`)
      .set(bearer(ctx.owner.token))
      .send({ listId: emptyId, position: 1024 })
      .expect(200);

    await request(app).delete(`${paths.lists}/${emptyId}`).set(bearer(ctx.owner.token)).expect(204);

    expect([...storage.removed].sort()).toEqual([...ctx.keys].sort());
  });
});
