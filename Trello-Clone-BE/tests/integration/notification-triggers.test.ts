import { formatMention, NotificationsPageSchema } from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { DUE_SOON_MS } from '../../src/modules/notifications/notifications.service';
import { paths } from '../data/http';
import { notificationData } from '../data/notifications';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Express } from 'express';

// NOTIFICATIONS-001b: docs/api/notifications.md → Triggers. Each change that notifies writes the
// rows in its own transaction; nobody is notified about their own action. Live delivery is in
// realtime-events.test.ts.

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

/** An owner's workspace with a board, a list and a card, and two MEMBERs. */
async function team() {
  const owner = await createUserWithToken({ name: notificationData.actorName });
  const ada = await createUserWithToken();
  const bob = await createUserWithToken();
  const ws = await request(app)
    .post(paths.workspaces)
    .set(bearer(owner.token))
    .send({ name: notificationData.workspaceName })
    .expect(201);
  const workspaceId = ws.body.data.id as string;
  await testPrisma.workspaceMember.createMany({
    data: [ada, bob].map((m) => ({ userId: m.user.id, workspaceId, role: 'MEMBER' as const })),
  });
  const board = await request(app)
    .post(`${paths.workspaces}/${workspaceId}/boards`)
    .set(bearer(owner.token))
    .send({ title: notificationData.boardTitle })
    .expect(201);
  const list = await request(app)
    .post(`${paths.boards}/${board.body.data.id as string}/lists`)
    .set(bearer(owner.token))
    .send({ title: notificationData.listTitle })
    .expect(201);
  const card = await request(app)
    .post(`${paths.lists}/${list.body.data.id as string}/cards`)
    .set(bearer(owner.token))
    .send({ title: notificationData.cardTitle })
    .expect(201);
  return {
    owner,
    ada,
    bob,
    workspaceId,
    boardId: board.body.data.id as string,
    cardId: card.body.data.id as string,
  };
}

const assign = (by: User, cardId: string, user: User) =>
  request(app).post(`${paths.cards}/${cardId}/members/${user.user.id}`).set(bearer(by.token));

const notificationsOf = async (user: User) => {
  const res = await request(app).get(paths.notifications).set(bearer(user.token)).expect(200);
  return NotificationsPageSchema.parse(res.body).data;
};

describe('CARD_ASSIGNED', () => {
  it('the assignee is notified once; assigning oneself or again notifies nobody', async () => {
    const t = await team();

    await assign(t.owner, t.cardId, t.ada).expect(204);
    await assign(t.owner, t.cardId, t.ada).expect(204); // already assigned: no change
    await assign(t.bob, t.cardId, t.bob).expect(204); // himself

    const [notification, ...rest] = await notificationsOf(t.ada);
    expect(rest).toEqual([]);
    expect(notification).toMatchObject({
      type: 'CARD_ASSIGNED',
      read: false,
      actor: { id: t.owner.user.id },
      workspace: { id: t.workspaceId },
      board: { id: t.boardId },
      card: { id: t.cardId, title: notificationData.cardTitle },
      comment: null,
    });
    expect(await notificationsOf(t.bob)).toEqual([]);
    expect(await notificationsOf(t.owner)).toEqual([]);
  });
});

describe('CARD_COMMENTED', () => {
  it("the card's members hear of a comment, except its author; others do not", async () => {
    const t = await team();
    await assign(t.owner, t.cardId, t.ada).expect(204);
    await assign(t.owner, t.cardId, t.owner).expect(204);
    await testPrisma.notification.deleteMany();

    const comment = await request(app)
      .post(`${paths.cards}/${t.cardId}/comments`)
      .set(bearer(t.owner.token))
      .send({ content: notificationData.longComment })
      .expect(201);

    const [notification, ...rest] = await notificationsOf(t.ada);
    expect(rest).toEqual([]);
    expect(notification).toMatchObject({
      type: 'CARD_COMMENTED',
      actor: { id: t.owner.user.id },
      card: { id: t.cardId },
      comment: {
        id: comment.body.data.id,
        excerpt: notificationData.longComment.trim().slice(0, 140),
      },
    });
    expect(await notificationsOf(t.owner)).toEqual([]); // the author
    expect(await notificationsOf(t.bob)).toEqual([]); // not a member of the card
  });
});

describe('CARD_MENTIONED', () => {
  it('mentioned workspace members hear of it instead of the plain comment; others and edits notify nobody', async () => {
    const t = await team();
    // A member of another workspace: not one of this card's workspace, so ignored.
    const outsider = await createUserWithToken();
    await request(app)
      .post(paths.workspaces)
      .set(bearer(outsider.token))
      .send({ name: notificationData.otherWorkspaceName })
      .expect(201);
    // Carol is on the card but not mentioned: she gets the plain comment notification.
    const carol = await createUserWithToken();
    await testPrisma.workspaceMember.create({
      data: { userId: carol.user.id, workspaceId: t.workspaceId, role: 'MEMBER' },
    });
    await assign(t.owner, t.cardId, t.ada).expect(204);
    await assign(t.owner, t.cardId, carol).expect(204);
    await testPrisma.notification.deleteMany();
    const content = [
      `Hey ${formatMention('Ada', t.ada.user.id)} and ${formatMention('Bob', t.bob.user.id)}`,
      `cc ${formatMention('Out', outsider.user.id)} ${formatMention('Me', t.owner.user.id)}`,
    ].join(' ');

    const comment = await request(app)
      .post(`${paths.cards}/${t.cardId}/comments`)
      .set(bearer(t.owner.token))
      .send({ content })
      .expect(201);

    // Ada is a member of the card too: one notification, the mention.
    for (const user of [t.ada, t.bob]) {
      const [notification, ...rest] = await notificationsOf(user);
      expect(rest).toEqual([]);
      expect(notification).toMatchObject({
        type: 'CARD_MENTIONED',
        actor: { id: t.owner.user.id },
        comment: { id: comment.body.data.id },
      });
    }
    const [plain, ...more] = await notificationsOf(carol);
    expect(more).toEqual([]);
    expect(plain).toMatchObject({ type: 'CARD_COMMENTED', comment: { id: comment.body.data.id } });
    expect(await testPrisma.notification.count({ where: { userId: outsider.user.id } })).toBe(0);
    expect(await notificationsOf(t.owner)).toEqual([]);

    // Editing a comment to add a mention notifies nobody.
    await request(app)
      .patch(`${paths.comments}/${comment.body.data.id as string}`)
      .set(bearer(t.owner.token))
      .send({ content: `${content} ${formatMention('Bob', t.bob.user.id)}!` })
      .expect(200);
    expect(await testPrisma.notification.count()).toBe(3);
  });
});

describe('WORKSPACE_INVITED', () => {
  it('an existing account is notified; re-inviting replaces it; an unknown email notifies nobody', async () => {
    const t = await team();
    const carol = await createUserWithToken();
    const invite = (email: string) =>
      request(app)
        .post(`${paths.workspaces}/${t.workspaceId}/invites`)
        .set(bearer(t.owner.token))
        .send({ email, role: 'MEMBER' })
        .expect(201);

    const first = await invite(carol.user.email);
    const second = await invite(carol.user.email);
    await invite(notificationData.unknownEmail);

    const [notification, ...rest] = await notificationsOf(carol);
    expect(rest).toEqual([]);
    expect(notification).toMatchObject({
      type: 'WORKSPACE_INVITED',
      actor: { id: t.owner.user.id },
      workspace: { id: t.workspaceId },
      invite: { id: second.body.data.id, role: 'MEMBER' },
      board: null,
    });
    expect(second.body.data.id).not.toBe(first.body.data.id);
    expect(await testPrisma.notification.count()).toBe(1);
  });
});

describe('CARD_DUE_SOON', () => {
  /** Sets the card's due date `ms` from now (and other fields), for its member `ada`. */
  const due = (
    cardId: string,
    ms: number,
    data: { completed?: boolean; archived?: boolean } = {},
  ) =>
    testPrisma.card.update({
      where: { id: cardId },
      data: { dueDate: new Date(Date.now() + ms), ...data },
    });

  it('a member is notified once per card and due date when reading', async () => {
    const t = await team();
    await assign(t.owner, t.cardId, t.ada).expect(204);
    await testPrisma.notification.deleteMany();
    await due(t.cardId, 2 * 60 * 60 * 1000);

    // Two tabs asking at once still make one row.
    const counts = await Promise.all(
      [0, 1].map(() =>
        request(app)
          .get(`${paths.notifications}/unread-count`)
          .set(bearer(t.ada.token))
          .expect(200),
      ),
    );
    expect(counts.map((res) => res.body.data.count)).toEqual([1, 1]);

    const [notification, ...rest] = await notificationsOf(t.ada);
    expect(rest).toEqual([]);
    expect(notification).toMatchObject({
      type: 'CARD_DUE_SOON',
      actor: null,
      card: { id: t.cardId },
    });
    expect(await notificationsOf(t.owner)).toEqual([]); // not a member of the card

    // A new due date notifies again.
    await due(t.cardId, 3 * 60 * 60 * 1000);
    expect(await notificationsOf(t.ada)).toHaveLength(2);
  });

  it('no notification for a card in a workspace the member has left', async () => {
    const t = await team();
    await assign(t.owner, t.cardId, t.ada).expect(204);
    await testPrisma.notification.deleteMany();
    await due(t.cardId, 60_000);
    // The assignment row stays (only the membership goes), so only the membership filter applies.
    await testPrisma.workspaceMember.delete({
      where: { userId_workspaceId: { userId: t.ada.user.id, workspaceId: t.workspaceId } },
    });

    await request(app)
      .get(`${paths.notifications}/unread-count`)
      .set(bearer(t.ada.token))
      .expect(200);
    expect(await testPrisma.notification.count()).toBe(0);
  });

  it.each([
    ['past', -60_000, {}],
    ['beyond the window', DUE_SOON_MS + 60_000, {}],
    ['completed', 60_000, { completed: true }],
    ['archived', 60_000, { archived: true }],
  ] as const)('no notification for a card that is %s', async (_case, ms, data) => {
    const t = await team();
    await assign(t.owner, t.cardId, t.ada).expect(204);
    await testPrisma.notification.deleteMany();
    await due(t.cardId, ms, data);

    expect(await notificationsOf(t.ada)).toEqual([]);
  });
});

describe('POST /notifications/read-all and hidden notifications', () => {
  it("leaves a workspace's notifications unread while the caller is not a member", async () => {
    const t = await team();
    await assign(t.owner, t.cardId, t.ada).expect(204);
    await testPrisma.workspaceMember.delete({
      where: { userId_workspaceId: { userId: t.ada.user.id, workspaceId: t.workspaceId } },
    });

    await request(app).post(`${paths.notifications}/read-all`).set(bearer(t.ada.token)).expect(204);
    await testPrisma.workspaceMember.create({
      data: { userId: t.ada.user.id, workspaceId: t.workspaceId, role: 'MEMBER' },
    });

    const [notification] = await notificationsOf(t.ada);
    expect(notification).toMatchObject({ type: 'CARD_ASSIGNED', read: false });
  });
});
