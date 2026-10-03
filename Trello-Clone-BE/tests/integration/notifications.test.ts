import {
  ErrorResponseSchema,
  NotificationsPageSchema,
  UnreadCountSchema,
  NotificationDtoSchema,
  WorkspaceDtoSchema,
  type Role,
} from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { paths } from '../data/http';
import { notificationData } from '../data/notifications';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Express } from 'express';

// NOTIFICATIONS-001a: docs/api/notifications.md (the endpoints and who sees a notification) and
// POST /invites/:inviteId/accept (docs/api/workspaces.md). The triggers arrive in 001b, so these
// tests write the rows directly. Tenant isolation runs in its own suite.

let app: Express;

beforeAll(() => {
  app = createTestApp();
});
beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
  await testPrisma.$disconnect();
});

type User = Awaited<ReturnType<typeof createUserWithToken>>;

/** A workspace with a board, a list, a card and a comment; `recipient` joins it with `role`. */
async function cardFor(recipient: User, role: Role = 'MEMBER') {
  const actor = await createUserWithToken({ name: notificationData.actorName });
  const workspace = await testPrisma.workspace.create({
    data: {
      name: notificationData.workspaceName,
      slug: `${notificationData.workspaceSlug}-${recipient.user.id}`,
      members: {
        create: [
          { userId: actor.user.id, role: 'OWNER' },
          { userId: recipient.user.id, role },
        ],
      },
    },
  });
  const board = await testPrisma.board.create({
    data: { workspaceId: workspace.id, title: notificationData.boardTitle },
  });
  const list = await testPrisma.list.create({
    data: { boardId: board.id, title: notificationData.listTitle, position: 1024 },
  });
  const card = await testPrisma.card.create({
    data: {
      boardId: board.id,
      listId: list.id,
      title: notificationData.cardTitle,
      position: 1024,
      dueDate: new Date(notificationData.dueDate),
    },
  });
  const comment = await testPrisma.comment.create({
    data: { cardId: card.id, authorId: actor.user.id, content: notificationData.longComment },
  });
  return { actor, workspace, board, card, comment };
}

type Fixture = Awaited<ReturnType<typeof cardFor>>;

/** A notification for `recipient` about the fixture's card, `minutesAgo` minutes old. */
const notify = (
  recipient: User,
  f: Fixture,
  {
    type = 'CARD_COMMENTED',
    minutesAgo = 0,
    read = false,
  }: { type?: 'CARD_COMMENTED' | 'CARD_ASSIGNED'; minutesAgo?: number; read?: boolean } = {},
) =>
  testPrisma.notification.create({
    data: {
      userId: recipient.user.id,
      type,
      workspaceId: f.workspace.id,
      actorId: f.actor.user.id,
      boardId: f.board.id,
      cardId: f.card.id,
      commentId: type === 'CARD_COMMENTED' ? f.comment.id : null,
      createdAt: new Date(Date.now() - minutesAgo * 60_000),
      readAt: read ? new Date() : null,
    },
  });

/** A pending invite of `f`'s workspace to `email`, and its notification for `recipient`. */
async function inviteFor(recipient: User, f: Fixture, email = recipient.user.email) {
  const invite = await testPrisma.workspaceInvite.create({
    data: {
      workspaceId: f.workspace.id,
      email,
      role: 'MEMBER',
      tokenHash: `hash-${recipient.user.id}-${email}`,
      invitedById: f.actor.user.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const notification = await testPrisma.notification.create({
    data: {
      userId: recipient.user.id,
      type: 'WORKSPACE_INVITED',
      workspaceId: f.workspace.id,
      actorId: f.actor.user.id,
      inviteId: invite.id,
    },
  });
  return { invite, notification };
}

const listOf = async (user: User, query: Record<string, string> = {}) => {
  const res = await request(app)
    .get(paths.notifications)
    .query(query)
    .set(bearer(user.token))
    .expect(200);
  return NotificationsPageSchema.parse(res.body);
};

const unreadOf = async (user: User) => {
  const res = await request(app)
    .get(`${paths.notifications}/unread-count`)
    .set(bearer(user.token))
    .expect(200);
  return UnreadCountSchema.parse(res.body.data).count;
};

describe('GET /api/v1/notifications', () => {
  it('200: the caller’s own, newest first, with current names and a 140-character excerpt', async () => {
    const me = await createUserWithToken();
    const f = await cardFor(me);
    const older = await notify(me, f, { type: 'CARD_ASSIGNED', minutesAgo: 5 });
    const newer = await notify(me, f);
    // Someone else's notification on the same card never shows.
    await notify(f.actor, f);
    await testPrisma.card.update({ where: { id: f.card.id }, data: { title: 'Renamed' } });

    const page = await listOf(me);

    expect(page.data.map((n) => n.id)).toEqual([newer.id, older.id]);
    expect(page.nextCursor).toBeNull();
    expect(page.data[0]).toEqual({
      id: newer.id,
      type: 'CARD_COMMENTED',
      read: false,
      createdAt: newer.createdAt.toISOString(),
      actor: { id: f.actor.user.id, name: notificationData.actorName, avatarUrl: null },
      workspace: { id: f.workspace.id, name: f.workspace.name, slug: f.workspace.slug },
      board: { id: f.board.id, title: notificationData.boardTitle },
      card: { id: f.card.id, title: 'Renamed', dueDate: notificationData.dueDate },
      comment: { id: f.comment.id, excerpt: notificationData.longComment.slice(0, 140) },
      invite: null,
    });
    expect(page.data[1]?.comment).toBeNull();
  });

  it('pages with a cursor; unread=true lists unread ones only', async () => {
    const me = await createUserWithToken();
    const f = await cardFor(me);
    const rows = [];
    for (let i = 0; i < 3; i += 1) rows.push(await notify(me, f, { minutesAgo: i, read: i === 1 }));

    const first = await listOf(me, { limit: '2' });
    expect(first.data.map((n) => n.id)).toEqual([rows[0]!.id, rows[1]!.id]);
    const second = await listOf(me, { limit: '2', cursor: first.nextCursor! });
    expect(second.data.map((n) => n.id)).toEqual([rows[2]!.id]);
    expect(second.nextCursor).toBeNull();

    const unread = await listOf(me, { unread: 'true' });
    expect(unread.data.map((n) => n.id)).toEqual([rows[0]!.id, rows[2]!.id]);
  });

  it('400 for an invalid query or a cursor that is not one of the caller’s; 401 without a token', async () => {
    const me = await createUserWithToken();
    const f = await cardFor(me);
    const theirs = await notify(f.actor, f);

    for (const query of [{ limit: '0' }, { unread: 'yes' }, { cursor: theirs.id }]) {
      const res = await request(app)
        .get(paths.notifications)
        .query(query)
        .set(bearer(me.token))
        .expect(400);
      expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    }
    await request(app).get(paths.notifications).expect(401);
  });

  it.each(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const)(
    'a %s sees the workspace’s notifications; once removed, they are hidden (not deleted)',
    async (role) => {
      const me = await createUserWithToken();
      const f = await cardFor(me, role);
      const row = await notify(me, f);
      expect((await listOf(me)).data.map((n) => n.id)).toEqual([row.id]);
      expect(await unreadOf(me)).toBe(1);

      await testPrisma.workspaceMember.delete({
        where: { userId_workspaceId: { userId: me.user.id, workspaceId: f.workspace.id } },
      });

      expect((await listOf(me)).data).toEqual([]);
      expect(await unreadOf(me)).toBe(0);
      await request(app)
        .patch(`${paths.notifications}/${row.id}`)
        .set(bearer(me.token))
        .send({ read: true })
        .expect(404);
      expect(await testPrisma.notification.count()).toBe(1);
    },
  );

  it('an invite shows while pending and addressed to the caller; then it is hidden', async () => {
    const me = await createUserWithToken();
    const outsider = await createUserWithToken();
    const f = await cardFor(outsider);
    const { invite, notification } = await inviteFor(me, f);

    const [shown] = (await listOf(me)).data;
    expect(shown).toMatchObject({
      id: notification.id,
      type: 'WORKSPACE_INVITED',
      invite: { id: invite.id, role: 'MEMBER' },
      board: null,
      card: null,
    });

    await testPrisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await listOf(me)).data).toEqual([]);
    expect(await unreadOf(me)).toBe(0);
  });

  it('deleting what a notification points to deletes it (card, comment, workspace)', async () => {
    const me = await createUserWithToken();
    const f = await cardFor(me);
    await notify(me, f);
    await notify(me, f, { type: 'CARD_ASSIGNED' });

    await testPrisma.comment.delete({ where: { id: f.comment.id } });
    expect(await testPrisma.notification.count()).toBe(1);
    await testPrisma.card.delete({ where: { id: f.card.id } });
    expect(await testPrisma.notification.count()).toBe(0);
  });
});

describe('GET /api/v1/notifications/unread-count', () => {
  it('200: the caller’s visible unread ones; 401 without a token', async () => {
    const me = await createUserWithToken();
    const f = await cardFor(me);
    await notify(me, f);
    await notify(me, f, { read: true });
    await notify(f.actor, f);

    expect(await unreadOf(me)).toBe(1);
    await request(app).get(`${paths.notifications}/unread-count`).expect(401);
  });
});

describe('PATCH /api/v1/notifications/:notificationId', () => {
  it('200: read and unread again; idempotent', async () => {
    const me = await createUserWithToken();
    const f = await cardFor(me);
    const row = await notify(me, f);
    const path = `${paths.notifications}/${row.id}`;

    const read = await request(app).patch(path).set(bearer(me.token)).send({ read: true });
    expect(read.status).toBe(200);
    expect(NotificationDtoSchema.parse(read.body.data)).toMatchObject({ id: row.id, read: true });
    const firstReadAt = (await testPrisma.notification.findUniqueOrThrow({ where: { id: row.id } }))
      .readAt;
    // Again: still read, the first read time kept.
    await request(app).patch(path).set(bearer(me.token)).send({ read: true }).expect(200);
    expect(
      (await testPrisma.notification.findUniqueOrThrow({ where: { id: row.id } })).readAt,
    ).toEqual(firstReadAt);
    expect(await unreadOf(me)).toBe(0);

    const unread = await request(app).patch(path).set(bearer(me.token)).send({ read: false });
    expect(unread.body.data.read).toBe(false);
    expect(await unreadOf(me)).toBe(1);
  });

  it('400 for an invalid body; 401 without a token; 404 for someone else’s or an unknown id', async () => {
    const me = await createUserWithToken();
    const f = await cardFor(me);
    const mine = await notify(me, f);
    const theirs = await notify(f.actor, f);

    const invalid = await request(app)
      .patch(`${paths.notifications}/${mine.id}`)
      .set(bearer(me.token))
      .send({ read: 'yes' })
      .expect(400);
    expect(ErrorResponseSchema.parse(invalid.body).error.code).toBe('VALIDATION_ERROR');
    await request(app).patch(`${paths.notifications}/${mine.id}`).send({ read: true }).expect(401);

    const foreign = await request(app)
      .patch(`${paths.notifications}/${theirs.id}`)
      .set(bearer(me.token))
      .send({ read: true })
      .expect(404);
    const unknown = await request(app)
      .patch(`${paths.notifications}/${notificationData.unknownId}`)
      .set(bearer(me.token))
      .send({ read: true })
      .expect(404);
    expect({ ...foreign.body.error, requestId: null }).toEqual({
      ...unknown.body.error,
      requestId: null,
    });
    expect(
      (await testPrisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt,
    ).toBeNull();
  });
});

describe('POST /api/v1/notifications/read-all', () => {
  it('204: every one of the caller’s is read, nobody else’s; 401 without a token', async () => {
    const me = await createUserWithToken();
    const f = await cardFor(me);
    await notify(me, f);
    await notify(me, f, { minutesAgo: 3 });
    const theirs = await notify(f.actor, f);

    await request(app).post(`${paths.notifications}/read-all`).set(bearer(me.token)).expect(204);

    expect(await unreadOf(me)).toBe(0);
    expect((await listOf(me)).data.every((n) => n.read)).toBe(true);
    expect(
      (await testPrisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt,
    ).toBeNull();
    await request(app).post(`${paths.notifications}/read-all`).expect(401);
  });
});

describe('POST /api/v1/invites/:inviteId/accept', () => {
  it('200: the addressee joins with the invite role, and the invite’s notification is read', async () => {
    const me = await createUserWithToken();
    const outsider = await createUserWithToken();
    const f = await cardFor(outsider);
    const { invite, notification } = await inviteFor(me, f);

    const res = await request(app)
      .post(`${paths.invites}/${invite.id}/accept`)
      .set(bearer(me.token))
      .expect(200);

    expect(WorkspaceDtoSchema.parse(res.body.data)).toMatchObject({
      id: f.workspace.id,
      role: 'MEMBER',
    });
    expect(
      await testPrisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: me.user.id, workspaceId: f.workspace.id } },
      }),
    ).toMatchObject({ role: 'MEMBER' });
    expect(
      (await testPrisma.notification.findUniqueOrThrow({ where: { id: notification.id } })).readAt,
    ).not.toBeNull();
    // Works once: accepting again is the same 404 as an unknown invite.
    await request(app)
      .post(`${paths.invites}/${invite.id}/accept`)
      .set(bearer(me.token))
      .expect(404);
  });

  it('404 for someone else’s invite, an expired or unknown one; 409 when already a member; 401', async () => {
    const me = await createUserWithToken();
    const someoneElse = await createUserWithToken();
    const f = await cardFor(me);
    const { invite: theirs } = await inviteFor(someoneElse, f);

    const foreign = await request(app)
      .post(`${paths.invites}/${theirs.id}/accept`)
      .set(bearer(me.token))
      .expect(404);
    const unknown = await request(app)
      .post(`${paths.invites}/${notificationData.unknownId}/accept`)
      .set(bearer(me.token))
      .expect(404);
    expect({ ...foreign.body.error, requestId: null }).toEqual({
      ...unknown.body.error,
      requestId: null,
    });
    await request(app).post(`${paths.invites}/not-a-cuid/accept`).set(bearer(me.token)).expect(404);

    // me is already a member of f's workspace.
    const { invite: mine } = await inviteFor(me, f);
    const conflict = await request(app)
      .post(`${paths.invites}/${mine.id}/accept`)
      .set(bearer(me.token))
      .expect(409);
    expect(ErrorResponseSchema.parse(conflict.body).error.code).toBe('CONFLICT');

    await testPrisma.workspaceInvite.update({
      where: { id: mine.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app).post(`${paths.invites}/${mine.id}/accept`).set(bearer(me.token)).expect(404);
    await request(app).post(`${paths.invites}/${mine.id}/accept`).expect(401);
  });
});
