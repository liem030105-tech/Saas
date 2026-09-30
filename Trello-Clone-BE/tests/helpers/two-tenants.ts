import request from 'supertest';

import { testPrisma } from './db';
import { bearer, createUserWithToken } from './users';
import { paths } from '../data/http';
import { tenantData } from '../data/workspaces';

import type { Express } from 'express';

// Two-tenant fixture (WORKSPACE-006): two users, each OWNER of their own workspace with a second
// member and a pending invite. Later tasks add their own sample data (boards, lists, cards) here,
// their tables to snapshotWorkspace (it is what detects a cross-tenant change), and their
// endpoints to tests/integration/tenant-isolation.test.ts.

async function tenant(app: Express, name: string, inviteEmail: string) {
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
  return {
    owner,
    member,
    workspaceId,
    slug: created.body.data.slug as string,
    inviteId: invite.body.data.id as string,
    /** The raw token from the invite link, as its recipient would have it. */
    inviteToken: (invite.body.data.inviteUrl as string).split('/').pop()!,
  };
}

export type Tenant = Awaited<ReturnType<typeof tenant>>;

/** Tenant A (the caller in the isolation suite) and tenant B (whose data must stay untouched). */
export async function createTwoTenants(app: Express) {
  const a = await tenant(app, tenantData.workspaceName.a, tenantData.inviteEmail.a);
  const b = await tenant(app, tenantData.workspaceName.b, tenantData.inviteEmail.b);
  return { a, b };
}

/** Everything stored for a workspace, in a stable order, to compare before and after a request. */
export async function snapshotWorkspace(workspaceId: string) {
  const [workspace, members, invites] = await Promise.all([
    testPrisma.workspace.findUnique({ where: { id: workspaceId } }),
    testPrisma.workspaceMember.findMany({ where: { workspaceId }, orderBy: { userId: 'asc' } }),
    testPrisma.workspaceInvite.findMany({ where: { workspaceId }, orderBy: { id: 'asc' } }),
  ]);
  return { workspace, members, invites };
}
