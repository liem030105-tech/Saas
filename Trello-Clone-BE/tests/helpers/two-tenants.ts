import request from 'supertest';

import { testPrisma } from './db';
import { bearer, createUserWithToken } from './users';
import { boardData } from '../data/boards';
import { cardData } from '../data/cards';
import { paths } from '../data/http';
import { listData } from '../data/lists';
import { tenantData } from '../data/workspaces';

import type { Express } from 'express';

// Two-tenant fixture (WORKSPACE-006): two users, each OWNER of their own workspace with a second
// member, a pending invite and a board (BOARD-001) with a list (LIST-001) holding a card
// (CARD-001); the board's default labels (CARD-005) carry one on the card, the member is assigned to it, and
// it has a checklist with one item and a comment by the member. Later tasks add their own sample data here,
// their tables to snapshotWorkspace (it is what detects a cross-tenant change), and their
// endpoints to tests/integration/tenant-isolation.test.ts.

async function tenant(
  app: Express,
  name: string,
  inviteEmail: string,
  boardTitle: string,
  listTitle: string,
  cardTitle: string,
) {
  const owner = await createUserWithToken();
  const created = await request(app)
    .post(paths.workspaces)
    .set(bearer(owner.token))
    .send({ name })
    .expect(201);
  const workspaceId = created.body.data.id as string;
  const member = await createUserWithToken();
  await testPrisma.workspaceMember.create({
    data: { userId: member.user.id, workspaceId, role: 'MEMBER' },
  });
  const invite = await request(app)
    .post(`${paths.workspaces}/${workspaceId}/invites`)
    .set(bearer(owner.token))
    .send({ email: inviteEmail, role: 'MEMBER' })
    .expect(201);
  const board = await request(app)
    .post(`${paths.workspaces}/${workspaceId}/boards`)
    .set(bearer(owner.token))
    .send({ title: boardTitle })
    .expect(201);
  const boardId = board.body.data.id as string;
  const list = await request(app)
    .post(`${paths.boards}/${boardId}/lists`)
    .set(bearer(owner.token))
    .send({ title: listTitle })
    .expect(201);
  const listId = list.body.data.id as string;
  const card = await request(app)
    .post(`${paths.lists}/${listId}/cards`)
    .set(bearer(owner.token))
    .send({ title: cardTitle })
    .expect(201);
  const cardId = card.body.data.id as string;
  const label = await testPrisma.label.findFirstOrThrow({ where: { boardId } });
  await request(app)
    .post(`${paths.cards}/${cardId}/labels/${label.id}`)
    .set(bearer(owner.token))
    .expect(204);
  await request(app)
    .post(`${paths.cards}/${cardId}/members/${member.user.id}`)
    .set(bearer(owner.token))
    .expect(204);
  const checklist = await request(app)
    .post(`${paths.cards}/${cardId}/checklists`)
    .set(bearer(owner.token))
    .send({ title: cardTitle })
    .expect(201);
  const checklistId = checklist.body.data.id as string;
  const item = await request(app)
    .post(`${paths.checklists}/${checklistId}/items`)
    .set(bearer(owner.token))
    .send({ content: cardTitle })
    .expect(201);
  const comment = await request(app)
    .post(`${paths.cards}/${cardId}/comments`)
    .set(bearer(member.token))
    .send({ content: cardTitle })
    .expect(201);
  const activity = await testPrisma.activity.findFirstOrThrow({ where: { boardId } });
  return {
    owner,
    member,
    workspaceId,
    boardId,
    listId,
    cardId,
    labelId: label.id,
    checklistId,
    itemId: item.body.data.id as string,
    commentId: comment.body.data.id as string,
    activityId: activity.id,
    slug: created.body.data.slug as string,
    inviteId: invite.body.data.id as string,
    /** The raw token from the invite link, as its recipient would have it. */
    inviteToken: (invite.body.data.inviteUrl as string).split('/').pop()!,
  };
}

export type Tenant = Awaited<ReturnType<typeof tenant>>;

/** Tenant A (the caller in the isolation suite) and tenant B (whose data must stay untouched). */
export async function createTwoTenants(app: Express) {
  const a = await tenant(
    app,
    tenantData.workspaceName.a,
    tenantData.inviteEmail.a,
    boardData.tenantBoard.a,
    listData.tenantList.a,
    cardData.tenantCard.a,
  );
  const b = await tenant(
    app,
    tenantData.workspaceName.b,
    tenantData.inviteEmail.b,
    boardData.tenantBoard.b,
    listData.tenantList.b,
    cardData.tenantCard.b,
  );
  return { a, b };
}

/** Everything stored for a workspace, in a stable order, to compare before and after a request. */
export async function snapshotWorkspace(workspaceId: string) {
  const [
    workspace,
    members,
    invites,
    boards,
    lists,
    cards,
    activities,
    labels,
    cardLabels,
    cardMembers,
    checklists,
    checklistItems,
    comments,
  ] = await Promise.all([
    testPrisma.workspace.findUnique({ where: { id: workspaceId } }),
    testPrisma.workspaceMember.findMany({ where: { workspaceId }, orderBy: { userId: 'asc' } }),
    testPrisma.workspaceInvite.findMany({ where: { workspaceId }, orderBy: { id: 'asc' } }),
    testPrisma.board.findMany({ where: { workspaceId }, orderBy: { id: 'asc' } }),
    testPrisma.list.findMany({ where: { board: { workspaceId } }, orderBy: { id: 'asc' } }),
    testPrisma.card.findMany({ where: { board: { workspaceId } }, orderBy: { id: 'asc' } }),
    testPrisma.activity.findMany({ where: { board: { workspaceId } }, orderBy: { id: 'asc' } }),
    testPrisma.label.findMany({ where: { board: { workspaceId } }, orderBy: { id: 'asc' } }),
    testPrisma.cardLabel.findMany({
      where: { card: { board: { workspaceId } } },
      orderBy: [{ cardId: 'asc' }, { labelId: 'asc' }],
    }),
    testPrisma.cardMember.findMany({
      where: { card: { board: { workspaceId } } },
      orderBy: [{ cardId: 'asc' }, { userId: 'asc' }],
    }),
    testPrisma.checklist.findMany({
      where: { card: { board: { workspaceId } } },
      orderBy: { id: 'asc' },
    }),
    testPrisma.checklistItem.findMany({
      where: { checklist: { card: { board: { workspaceId } } } },
      orderBy: { id: 'asc' },
    }),
    testPrisma.comment.findMany({
      where: { card: { board: { workspaceId } } },
      orderBy: { id: 'asc' },
    }),
  ]);
  return {
    workspace,
    members,
    invites,
    boards,
    lists,
    cards,
    activities,
    labels,
    cardLabels,
    cardMembers,
    checklists,
    checklistItems,
    comments,
  };
}
