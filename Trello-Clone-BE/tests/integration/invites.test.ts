import { createHash } from 'node:crypto';

import {
  CreatedInviteDtoSchema,
  ErrorResponseSchema,
  InviteDtoSchema,
  WorkspaceDtoSchema,
} from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { testEnv } from '../data/env';
import { paths } from '../data/http';
import {
  invalidInviteBodies,
  inviteeEmail,
  invitesWorkspaceName,
  unknownInviteToken,
} from '../data/workspaces';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Role } from '@trello-clone/shared';
import type { Express } from 'express';

// WORKSPACE-004: docs/api/workspaces.md → Invitations.

type Caller = Awaited<ReturnType<typeof createUserWithToken>>;

let app: Express;

beforeAll(() => {
  app = createTestApp();
});
beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
  await testPrisma.$disconnect();
});

const invitesPath = (workspaceId: string) => `${paths.workspaces}/${workspaceId}/invites`;
const acceptPath = paths.invitesAccept;

/** A workspace created by `owner`, plus one extra member per role in `roles`. */
async function workspaceWith(...roles: Role[]) {
  const owner = await createUserWithToken();
  const created = await request(app)
    .post(paths.workspaces)
    .set(bearer(owner.token))
    .send({ name: invitesWorkspaceName })
    .expect(201);
  const workspaceId = created.body.data.id as string;
  const members: Caller[] = [];
  for (const role of roles) {
    const member = await createUserWithToken();
    await testPrisma.workspaceMember.create({
      data: { userId: member.user.id, workspaceId, role },
    });
    members.push(member);
  }
  return { workspaceId, owner, members };
}

const invite = (workspaceId: string, caller: Caller, body: object) =>
  request(app).post(invitesPath(workspaceId)).set(bearer(caller.token)).send(body);

const accept = (caller: Caller, token: string) =>
  request(app).post(acceptPath).set(bearer(caller.token)).send({ token });

/** The raw token is the last segment of `inviteUrl` (`<CLIENT_URL>/invite/<token>`). */
const tokenOf = (res: request.Response) => (res.body.data.inviteUrl as string).split('/').pop()!;

/** A pending invite for a new user (who exists, with the invited email) and that user. */
async function inviteNewUser(workspaceId: string, by: Caller, role: Role = 'MEMBER') {
  const invitee = await createUserWithToken({ email: inviteeEmail.stored });
  const res = await invite(workspaceId, by, { email: inviteeEmail.typed, role }).expect(201);
  return { invitee, token: tokenOf(res), inviteId: res.body.data.id as string };
}

describe('POST /api/v1/workspaces/:workspaceId/invites', () => {
  it.each(['OWNER', 'ADMIN'] as const)(
    '201 for a %s: returns the invite and its link once; stores only the hash',
    async (role) => {
      const { workspaceId, owner, members } = await workspaceWith('ADMIN');
      const caller = role === 'OWNER' ? owner : members[0]!;

      const res = await invite(workspaceId, caller, { email: inviteeEmail.typed, role: 'ADMIN' });

      expect(res.status).toBe(201);
      const created = CreatedInviteDtoSchema.parse(res.body.data);
      expect(created).toMatchObject({
        email: inviteeEmail.stored,
        role: 'ADMIN',
        invitedBy: { id: caller.user.id },
      });
      expect(created.inviteUrl.startsWith(`${testEnv.CLIENT_URL}/invite/`)).toBe(true);
      const token = tokenOf(res);
      const stored = await testPrisma.workspaceInvite.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(stored.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
      expect(JSON.stringify(stored)).not.toContain(token);
      const days = (Date.parse(created.expiresAt) - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThanOrEqual(7);
    },
  );

  it('re-inviting the same email replaces the invite; the old link stops working', async () => {
    const { workspaceId, owner } = await workspaceWith();
    const first = await inviteNewUser(workspaceId, owner);

    const second = await invite(workspaceId, owner, {
      email: inviteeEmail.stored,
      role: 'VIEWER',
    }).expect(201);

    expect(await testPrisma.workspaceInvite.count({ where: { workspaceId } })).toBe(1);
    expect((await accept(first.invitee, first.token)).status).toBe(404);
    const res = await accept(first.invitee, tokenOf(second));
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('VIEWER');
  });

  it('409 when the email already belongs to a member', async () => {
    const { workspaceId, owner, members } = await workspaceWith('MEMBER');

    const res = await invite(workspaceId, owner, {
      email: members[0]!.user.email.toUpperCase(),
      role: 'MEMBER',
    });

    expect(res.status).toBe(409);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('CONFLICT');
  });

  it.each(invalidInviteBodies)('400 for $case', async ({ body }) => {
    const { workspaceId, owner } = await workspaceWith();

    const res = await invite(workspaceId, owner, body);

    expect(res.status).toBe(400);
    expect(await testPrisma.workspaceInvite.count()).toBe(0);
  });

  it.each(['MEMBER', 'VIEWER'] as const)('403 for a %s', async (role) => {
    const { workspaceId, members } = await workspaceWith(role);

    const res = await invite(workspaceId, members[0]!, {
      email: inviteeEmail.typed,
      role: 'VIEWER',
    });

    expect(res.status).toBe(403);
    expect(await testPrisma.workspaceInvite.count()).toBe(0);
  });

  it('404 for a non-member', async () => {
    const { workspaceId } = await workspaceWith();
    const outsider = await createUserWithToken();

    const res = await invite(workspaceId, outsider, { email: inviteeEmail.typed, role: 'MEMBER' });

    expect(res.status).toBe(404);
  });

  it('401 without a token', async () => {
    const { workspaceId } = await workspaceWith();

    const res = await request(app)
      .post(invitesPath(workspaceId))
      .send({ email: inviteeEmail.typed, role: 'MEMBER' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/workspaces/:workspaceId/invites', () => {
  it('200 for an ADMIN: pending invites only, never a token or its hash', async () => {
    const { workspaceId, owner, members } = await workspaceWith('ADMIN');
    const pending = await inviteNewUser(workspaceId, owner);
    const expired = await invite(workspaceId, owner, {
      email: 'late@example.test',
      role: 'MEMBER',
    });
    await testPrisma.workspaceInvite.update({
      where: { id: expired.body.data.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const acceptedUser = await createUserWithToken({ email: 'joined@example.test' });
    const accepted = await invite(workspaceId, owner, {
      email: acceptedUser.user.email,
      role: 'MEMBER',
    });
    await accept(acceptedUser, tokenOf(accepted)).expect(200);

    const res = await request(app).get(invitesPath(workspaceId)).set(bearer(members[0]!.token));

    expect(res.status).toBe(200);
    const list = InviteDtoSchema.array().parse(res.body.data);
    expect(list.map((i) => i.id)).toEqual([pending.inviteId]);
    expect(JSON.stringify(res.body)).not.toMatch(/token|inviteUrl/i);
  });

  it.each(['MEMBER', 'VIEWER'] as const)('403 for a %s', async (role) => {
    const { workspaceId, members } = await workspaceWith(role);

    expect(
      (await request(app).get(invitesPath(workspaceId)).set(bearer(members[0]!.token))).status,
    ).toBe(403);
  });

  it('404 for a non-member', async () => {
    const { workspaceId } = await workspaceWith();
    const outsider = await createUserWithToken();

    expect(
      (await request(app).get(invitesPath(workspaceId)).set(bearer(outsider.token))).status,
    ).toBe(404);
  });

  it('401 without a token', async () => {
    const { workspaceId } = await workspaceWith();

    expect((await request(app).get(invitesPath(workspaceId))).status).toBe(401);
  });
});

describe('DELETE /api/v1/workspaces/:workspaceId/invites/:inviteId', () => {
  const revoke = (workspaceId: string, caller: Caller, inviteId: string) =>
    request(app)
      .delete(`${invitesPath(workspaceId)}/${inviteId}`)
      .set(bearer(caller.token));

  it('204 for an ADMIN; the link stops working', async () => {
    const { workspaceId, owner, members } = await workspaceWith('ADMIN');
    const pending = await inviteNewUser(workspaceId, owner);

    expect((await revoke(workspaceId, members[0]!, pending.inviteId)).status).toBe(204);
    expect((await accept(pending.invitee, pending.token)).status).toBe(404);
  });

  it('404 for an unknown invite, or one from another workspace', async () => {
    const { workspaceId, owner } = await workspaceWith();
    const other = await workspaceWith();
    const foreign = await inviteNewUser(other.workspaceId, other.owner);

    for (const id of ['clx0000000000000000000099', foreign.inviteId]) {
      expect((await revoke(workspaceId, owner, id)).status).toBe(404);
    }
    expect(await testPrisma.workspaceInvite.count({ where: { id: foreign.inviteId } })).toBe(1);
  });

  it.each(['MEMBER', 'VIEWER'] as const)('403 for a %s', async (role) => {
    const { workspaceId, owner, members } = await workspaceWith(role);
    const pending = await inviteNewUser(workspaceId, owner);

    expect((await revoke(workspaceId, members[0]!, pending.inviteId)).status).toBe(403);
  });

  it('404 for a non-member', async () => {
    const { workspaceId, owner } = await workspaceWith();
    const pending = await inviteNewUser(workspaceId, owner);
    const outsider = await createUserWithToken();

    expect((await revoke(workspaceId, outsider, pending.inviteId)).status).toBe(404);
  });

  it('401 without a token', async () => {
    const { workspaceId, owner } = await workspaceWith();
    const pending = await inviteNewUser(workspaceId, owner);

    const res = await request(app).delete(`${invitesPath(workspaceId)}/${pending.inviteId}`);

    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/invites/accept', () => {
  it('200: the invited user joins with the invited role; the link works once', async () => {
    const { workspaceId, owner } = await workspaceWith();
    const { invitee, token } = await inviteNewUser(workspaceId, owner, 'ADMIN');

    const res = await accept(invitee, token);

    expect(res.status).toBe(200);
    expect(WorkspaceDtoSchema.parse(res.body.data)).toMatchObject({
      id: workspaceId,
      role: 'ADMIN',
    });
    const member = await testPrisma.workspaceMember.findUniqueOrThrow({
      where: { userId_workspaceId: { userId: invitee.user.id, workspaceId } },
    });
    expect(member.role).toBe('ADMIN');
    const stored = await testPrisma.workspaceInvite.findFirstOrThrow({ where: { workspaceId } });
    expect(stored.acceptedAt).not.toBeNull();

    expect((await accept(invitee, token)).status).toBe(404);
  });

  it('404, identical for unknown, expired, and someone else’s invite', async () => {
    const { workspaceId, owner } = await workspaceWith();
    const { invitee, token } = await inviteNewUser(workspaceId, owner);
    const stranger = await createUserWithToken();
    const expired = await createUserWithToken({ email: 'expired@example.test' });
    const expiredRes = await invite(workspaceId, owner, {
      email: expired.user.email,
      role: 'MEMBER',
    });
    await testPrisma.workspaceInvite.update({
      where: { id: expiredRes.body.data.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const responses = [
      await accept(invitee, unknownInviteToken),
      await accept(expired, tokenOf(expiredRes)),
      await accept(stranger, token),
    ];

    const bodies = responses.map((res) => {
      expect(res.status).toBe(404);
      return { ...ErrorResponseSchema.parse(res.body).error, requestId: null };
    });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(await testPrisma.workspaceMember.count({ where: { workspaceId } })).toBe(1);
  });

  it('the same link accepted twice at once adds the member once', async () => {
    const { workspaceId, owner } = await workspaceWith();
    const { invitee, token } = await inviteNewUser(workspaceId, owner);

    const responses = await Promise.all([accept(invitee, token), accept(invitee, token)]);

    expect(responses.map((res) => res.status)).toContain(200);
    expect(responses.filter((res) => res.status === 200)).toHaveLength(1);
    expect(
      await testPrisma.workspaceMember.count({ where: { workspaceId, userId: invitee.user.id } }),
    ).toBe(1);
  });

  it('409 when the invited user is already a member; the invite stays pending', async () => {
    const { workspaceId, owner } = await workspaceWith();
    const { invitee, token } = await inviteNewUser(workspaceId, owner);
    await testPrisma.workspaceMember.create({
      data: { userId: invitee.user.id, workspaceId, role: 'VIEWER' },
    });

    const res = await accept(invitee, token);

    expect(res.status).toBe(409);
    const stored = await testPrisma.workspaceInvite.findFirstOrThrow({ where: { workspaceId } });
    expect(stored.acceptedAt).toBeNull();
  });

  it('400 without a token in the body', async () => {
    const caller = await createUserWithToken();

    const res = await request(app).post(acceptPath).set(bearer(caller.token)).send({});

    expect(res.status).toBe(400);
  });

  it('401 without an access token', async () => {
    expect((await request(app).post(acceptPath).send({ token: unknownInviteToken })).status).toBe(
      401,
    );
  });
});
