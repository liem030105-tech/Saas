import {
  AttachmentDtoSchema,
  CardDetailDtoSchema,
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
  return { owner, member, workspaceId, cardId: card.body.data.id as string };
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

  it('404 for an unknown id', async () => {
    const { owner } = await cardWithMember();
    await request(app)
      .delete(`${paths.attachments}/clx0000000000000000000099`)
      .set(bearer(owner.token))
      .expect(404);
  });
});
