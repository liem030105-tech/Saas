import { BillingDtoSchema, ErrorResponseSchema, PLAN_LIMITS } from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import * as attachmentsService from '../../src/modules/cards/attachments.service';
import { attachmentData } from '../data/attachments';
import { billingData } from '../data/billing';
import { paths } from '../data/http';
import { resetDb, testPrisma } from '../helpers/db';
import { installMemoryStorage, type MemoryStorage } from '../helpers/storage';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Express } from 'express';

// BILLING-001a: docs/api/billing.md → Plans and limits, and GET /workspaces/:workspaceId/billing.
// The plan is set directly here (only the Stripe webhook changes it in the app). The role matrix
// and tenant isolation of the route run in their own suites.

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

type User = Awaited<ReturnType<typeof createUserWithToken>>;

async function workspaceOf(owner: User) {
  const res = await request(app)
    .post(paths.workspaces)
    .set(bearer(owner.token))
    .send({ name: billingData.workspaceName })
    .expect(201);
  return res.body.data.id as string;
}

const setPlan = (workspaceId: string, plan: 'FREE' | 'PRO') =>
  testPrisma.workspace.update({ where: { id: workspaceId }, data: { plan } });

const createBoard = (owner: User, workspaceId: string, n: number) =>
  request(app)
    .post(`${paths.workspaces}/${workspaceId}/boards`)
    .set(bearer(owner.token))
    .send({ title: billingData.boardTitle(n) });

const invite = (owner: User, workspaceId: string, email: string) =>
  request(app)
    .post(`${paths.workspaces}/${workspaceId}/invites`)
    .set(bearer(owner.token))
    .send({ email, role: 'MEMBER' });

const billingOf = (user: User, workspaceId: string) =>
  request(app).get(`${paths.workspaces}/${workspaceId}/billing`).set(bearer(user.token));

/** Adds `count` MEMBERs directly. */
async function addMembers(workspaceId: string, count: number) {
  for (let i = 0; i < count; i++) {
    const user = await createUserWithToken();
    await testPrisma.workspaceMember.create({
      data: { userId: user.user.id, workspaceId, role: 'MEMBER' },
    });
  }
}

const expectLimit = (res: request.Response, limit: string) => {
  expect(res.status).toBe(402);
  const { error } = ErrorResponseSchema.parse(res.body);
  expect(error.code).toBe('PLAN_LIMIT_REACHED');
  expect(error.details).toEqual([expect.objectContaining({ limit })]);
};

describe('GET /workspaces/:workspaceId/billing', () => {
  it('200: a new workspace is FREE, never subscribed; usage counts every board and members plus pending invites', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    await addMembers(workspaceId, 1);
    const archived = await createBoard(owner, workspaceId, 1).expect(201);
    await testPrisma.board.update({
      where: { id: archived.body.data.id as string },
      data: { archived: true },
    });
    await createBoard(owner, workspaceId, 2).expect(201);
    await invite(owner, workspaceId, billingData.inviteEmail(1)).expect(201);
    const expired = await invite(owner, workspaceId, billingData.inviteEmail(2)).expect(201);
    await testPrisma.workspaceInvite.update({
      where: { id: expired.body.data.id as string },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await billingOf(owner, workspaceId).expect(200);
    expect(BillingDtoSchema.parse(res.body.data)).toEqual({
      plan: 'FREE',
      status: null,
      currentPeriodEnd: null,
      usage: { boards: 2, members: 3 }, // owner, member, one pending invite
    });
  });

  it("200: a subscribed workspace shows its subscription's status and period end", async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    await setPlan(workspaceId, 'PRO');
    await testPrisma.subscription.create({
      data: { workspaceId, status: 'PAST_DUE', currentPeriodEnd: billingData.periodEnd },
    });

    const res = await billingOf(owner, workspaceId).expect(200);
    expect(res.body.data).toMatchObject({
      plan: 'PRO',
      status: 'PAST_DUE',
      currentPeriodEnd: billingData.periodEnd.toISOString(),
    });
  });

  it('401 without a token; 404 for a malformed id', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    await request(app).get(`${paths.workspaces}/${workspaceId}/billing`).expect(401);
    await request(app)
      .get(`${paths.workspaces}/not-an-id/billing`)
      .set(bearer(owner.token))
      .expect(404);
  });
});

describe('board limit', () => {
  it('Free: the 5th board is created, the 6th is 402 and nothing is written', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    for (let n = 1; n <= 5; n++) await createBoard(owner, workspaceId, n).expect(201);

    expectLimit(await createBoard(owner, workspaceId, 6), 'boards');
    expect(await testPrisma.board.count({ where: { workspaceId } })).toBe(5);
  });

  it('Free: two creates at once for the last slot make one board', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    for (let n = 1; n <= 4; n++) await createBoard(owner, workspaceId, n).expect(201);

    const results = await Promise.all([5, 6].map((n) => createBoard(owner, workspaceId, n)));
    expect(results.map((res) => res.status).sort()).toEqual([201, 402]);
    expect(await testPrisma.board.count({ where: { workspaceId } })).toBe(5);
  });

  it('Pro: no limit; after a downgrade every board stays, and creating more is 402', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    await setPlan(workspaceId, 'PRO');
    for (let n = 1; n <= 6; n++) await createBoard(owner, workspaceId, n).expect(201);

    await setPlan(workspaceId, 'FREE');
    const boards = await request(app)
      .get(`${paths.workspaces}/${workspaceId}/boards`)
      .set(bearer(owner.token))
      .expect(200);
    expect(boards.body.data).toHaveLength(6);
    expectLimit(await createBoard(owner, workspaceId, 7), 'boards');
  });
});

describe('member limit', () => {
  it('Free: members plus pending invites up to 5; the next invite is 402; re-inviting a pending email is not', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    await addMembers(workspaceId, 2);
    await invite(owner, workspaceId, billingData.inviteEmail(1)).expect(201);
    await invite(owner, workspaceId, billingData.inviteEmail(2)).expect(201); // 5th

    expectLimit(await invite(owner, workspaceId, billingData.inviteEmail(3)), 'members');
    // The replaced invite no longer counts.
    await invite(owner, workspaceId, billingData.inviteEmail(2)).expect(201);
    expect(await testPrisma.workspaceInvite.count({ where: { workspaceId } })).toBe(2);
  });

  it('Free: two invites at once for the last slot make one invite', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    await addMembers(workspaceId, 3);

    const results = await Promise.all(
      [1, 2].map((n) => invite(owner, workspaceId, billingData.inviteEmail(n))),
    );
    expect(results.map((res) => res.status).sort()).toEqual([201, 402]);
    expect(await testPrisma.workspaceInvite.count({ where: { workspaceId } })).toBe(1);
  });

  it('Free: accepting a pending invite that fits the limit works, the invite already counted', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    await addMembers(workspaceId, 3);
    const guest = await createUserWithToken();
    const sent = await invite(owner, workspaceId, guest.user.email).expect(201); // 5th

    await request(app)
      .post(`${paths.invites}/${sent.body.data.id as string}/accept`)
      .set(bearer(guest.token))
      .expect(200);
    expect(await testPrisma.workspaceMember.count({ where: { workspaceId } })).toBe(5);
  });

  it('after a downgrade to Free with 5 members, a pending invite cannot be accepted (402) and stays pending', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    await setPlan(workspaceId, 'PRO');
    await addMembers(workspaceId, 4);
    const guest = await createUserWithToken();
    const sent = await invite(owner, workspaceId, guest.user.email).expect(201);
    await setPlan(workspaceId, 'FREE');

    const res = await request(app)
      .post(`${paths.invites}/${sent.body.data.id as string}/accept`)
      .set(bearer(guest.token));
    expectLimit(res, 'members');
    expect(
      await testPrisma.workspaceInvite.findUniqueOrThrow({
        where: { id: sent.body.data.id as string },
      }),
    ).toMatchObject({ acceptedAt: null });
    expect(await testPrisma.workspaceMember.count({ where: { workspaceId } })).toBe(5);
  });

  it('Pro: no limit', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    await setPlan(workspaceId, 'PRO');
    await addMembers(workspaceId, 4);

    await invite(owner, workspaceId, billingData.inviteEmail(1)).expect(201);
    await invite(owner, workspaceId, billingData.inviteEmail(2)).expect(201);
  });
});

describe('file size limit', () => {
  async function cardIn(owner: User, workspaceId: string) {
    const board = await createBoard(owner, workspaceId, 1).expect(201);
    const list = await request(app)
      .post(`${paths.boards}/${board.body.data.id as string}/lists`)
      .set(bearer(owner.token))
      .send({ title: billingData.listTitle })
      .expect(201);
    const card = await request(app)
      .post(`${paths.lists}/${list.body.data.id as string}/cards`)
      .set(bearer(owner.token))
      .send({ title: billingData.cardTitle })
      .expect(201);
    return card.body.data.id as string;
  }

  const upload = (owner: User, cardId: string, bytes: number) =>
    request(app)
      .post(`${paths.cards}/${cardId}/attachments`)
      .set(bearer(owner.token))
      .attach('file', Buffer.alloc(bytes, 0x61), 'big.txt');

  it('Free: over 10 MB is 402 and nothing is stored; Pro takes it', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    const cardId = await cardIn(owner, workspaceId);

    expectLimit(await upload(owner, cardId, attachmentData.tooLargeBytes), 'fileSize');
    expect(storage.objects.size).toBe(0);

    await setPlan(workspaceId, 'PRO');
    await upload(owner, cardId, attachmentData.tooLargeBytes).expect(201);
    expect(storage.objects.size).toBe(1);
  });

  it('the service checks the size again (a plan changed after the upload was read)', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    const cardId = await cardIn(owner, workspaceId);

    await expect(
      attachmentsService.upload(owner.user.id, cardId, {
        buffer: Buffer.alloc(attachmentData.tooLargeBytes, 0x61),
        originalname: 'big.txt',
      }),
    ).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED', status: 402 });
    expect(storage.objects.size).toBe(0);
  });

  it('Pro: over 100 MB is 413', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    const cardId = await cardIn(owner, workspaceId);
    await setPlan(workspaceId, 'PRO');

    const res = await upload(owner, cardId, PLAN_LIMITS.PRO.maxFileBytes + 1).expect(413);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('FILE_TOO_LARGE');
    expect(storage.objects.size).toBe(0);
  });
});

describe('activity retention', () => {
  it('Free shows the last 7 days of activity; Pro shows all of it; nothing is deleted', async () => {
    const owner = await createUserWithToken();
    const workspaceId = await workspaceOf(owner);
    const board = await createBoard(owner, workspaceId, 1).expect(201);
    const boardId = board.body.data.id as string;
    await request(app)
      .post(`${paths.boards}/${boardId}/lists`)
      .set(bearer(owner.token))
      .send({ title: billingData.listTitle })
      .expect(201);
    // BOARD_CREATED is made 8 days old; LIST_CREATED stays recent.
    const old = await testPrisma.activity.findFirstOrThrow({
      where: { boardId, type: 'BOARD_CREATED' },
    });
    await testPrisma.activity.update({
      where: { id: old.id },
      data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });
    const feed = async () => {
      const res = await request(app)
        .get(`${paths.boards}/${boardId}/activities`)
        .set(bearer(owner.token))
        .expect(200);
      return (res.body.data as { type: string }[]).map((entry) => entry.type);
    };

    expect(await feed()).toEqual(['LIST_CREATED']);
    // An old entry's id is not a cursor of this feed any more.
    await request(app)
      .get(`${paths.boards}/${boardId}/activities?cursor=${old.id}`)
      .set(bearer(owner.token))
      .expect(400);

    await setPlan(workspaceId, 'PRO');
    expect(await feed()).toEqual(['LIST_CREATED', 'BOARD_CREATED']);
  });
});
