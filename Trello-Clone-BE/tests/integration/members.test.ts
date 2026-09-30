import { ErrorResponseSchema, MemberDtoSchema } from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { paths } from '../data/http';
import {
  invalidRoleBodies,
  memberNames,
  membersWorkspaceName,
  unknownWorkspaceId,
} from '../data/workspaces';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Role } from '@trello-clone/shared';
import type { Express } from 'express';

// WORKSPACE-003: docs/api/workspaces.md → Members; rules: docs/api/README.md → Permission matrix.

type Member = Awaited<ReturnType<typeof createUserWithToken>>;

let app: Express;

beforeAll(() => {
  app = createTestApp();
});
beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
  await testPrisma.$disconnect();
});

const membersPath = (workspaceId: string) => `${paths.workspaces}/${workspaceId}/members`;
const memberPath = (workspaceId: string, userId: string) => `${membersPath(workspaceId)}/${userId}`;

/** A workspace created by `owner`, plus one extra member per role in `roles`. */
async function workspaceWith(...roles: Role[]) {
  const owner = await createUserWithToken({ name: memberNames.owner });
  const created = await request(app)
    .post(paths.workspaces)
    .set(bearer(owner.token))
    .send({ name: membersWorkspaceName })
    .expect(201);
  const workspaceId = created.body.data.id as string;
  const members: Member[] = [];
  for (const role of roles) {
    const member = await createUserWithToken();
    await testPrisma.workspaceMember.create({
      data: { userId: member.user.id, workspaceId, role },
    });
    members.push(member);
  }
  return { workspaceId, owner, members };
}

const roleOf = async (workspaceId: string, userId: string) =>
  (
    await testPrisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    })
  )?.role;

const ownerCount = (workspaceId: string) =>
  testPrisma.workspaceMember.count({ where: { workspaceId, role: 'OWNER' } });

const changeRole = (workspaceId: string, actor: Member, target: string, body: object) =>
  request(app).patch(memberPath(workspaceId, target)).set(bearer(actor.token)).send(body);

const remove = (workspaceId: string, actor: Member, target: string) =>
  request(app).delete(memberPath(workspaceId, target)).set(bearer(actor.token));

function expectLastOwner(res: request.Response) {
  expect(res.status).toBe(422);
  const { error } = ErrorResponseSchema.parse(res.body);
  expect(error.code).toBe('BUSINESS_RULE_VIOLATION');
  expect(error.details[0]).toMatchObject({ rule: 'LAST_OWNER' });
}

describe('GET /api/v1/workspaces/:workspaceId/members', () => {
  it.each(['ADMIN', 'MEMBER', 'VIEWER'] as const)(
    '200 for a %s: every member, by role then name, public fields only',
    async (role) => {
      const { workspaceId, owner, members } = await workspaceWith('VIEWER', role, 'MEMBER');
      await testPrisma.user.update({
        where: { id: members[1]!.user.id },
        data: { name: memberNames.admin },
      });
      const caller = members[1]!;

      const res = await request(app).get(membersPath(workspaceId)).set(bearer(caller.token));

      expect(res.status).toBe(200);
      const list = MemberDtoSchema.array().parse(res.body.data);
      expect(list).toHaveLength(4);
      expect(list[0]).toMatchObject({ role: 'OWNER', user: { id: owner.user.id } });
      const order = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];
      const indexes = list.map((m) => order.indexOf(m.role));
      expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
      for (const item of res.body.data) {
        expect(Object.keys(item.user).sort()).toEqual(['avatarUrl', 'email', 'id', 'name']);
      }
    },
  );

  it('orders members with the same role by name, case-insensitively', async () => {
    const { workspaceId, owner, members } = await workspaceWith('ADMIN', 'ADMIN');
    await testPrisma.user.update({
      where: { id: members[0]!.user.id },
      data: { name: memberNames.admin },
    });
    await testPrisma.user.update({
      where: { id: members[1]!.user.id },
      data: { name: memberNames.admin2 },
    });

    const res = await request(app).get(membersPath(workspaceId)).set(bearer(owner.token));

    expect(res.body.data.map((m: { user: { name: string } }) => m.user.name)).toEqual([
      memberNames.owner,
      memberNames.admin2,
      memberNames.admin,
    ]);
  });

  it('404 for a non-member and an unknown workspace', async () => {
    const { workspaceId } = await workspaceWith();
    const outsider = await createUserWithToken();

    for (const id of [workspaceId, unknownWorkspaceId]) {
      const res = await request(app).get(membersPath(id)).set(bearer(outsider.token));
      expect(res.status).toBe(404);
    }
  });

  it('401 without a token', async () => {
    const { workspaceId } = await workspaceWith();

    expect((await request(app).get(membersPath(workspaceId))).status).toBe(401);
  });
});

describe('PATCH /api/v1/workspaces/:workspaceId/members/:userId', () => {
  it.each([
    ['OWNER', 'MEMBER', 'ADMIN'],
    ['OWNER', 'VIEWER', 'OWNER'],
    ['ADMIN', 'MEMBER', 'VIEWER'],
    ['ADMIN', 'VIEWER', 'ADMIN'],
    ['ADMIN', 'ADMIN', 'MEMBER'],
  ] as const)('200: a %s changes a %s to %s', async (actorRole, targetRole, newRole) => {
    const { workspaceId, owner, members } = await workspaceWith('ADMIN', targetRole);
    const actor = actorRole === 'OWNER' ? owner : members[0]!;
    const target = members[1]!;

    const res = await changeRole(workspaceId, actor, target.user.id, { role: newRole });

    expect(res.status).toBe(200);
    expect(MemberDtoSchema.parse(res.body.data)).toMatchObject({
      role: newRole,
      user: { id: target.user.id },
    });
    expect(await roleOf(workspaceId, target.user.id)).toBe(newRole);
  });

  it('403: an ADMIN cannot change an OWNER', async () => {
    const { workspaceId, owner, members } = await workspaceWith('ADMIN');

    const res = await changeRole(workspaceId, members[0]!, owner.user.id, { role: 'ADMIN' });

    expect(res.status).toBe(403);
    expect(await roleOf(workspaceId, owner.user.id)).toBe('OWNER');
  });

  it('403: an ADMIN cannot grant OWNER, not even to themselves', async () => {
    const { workspaceId, members } = await workspaceWith('ADMIN', 'MEMBER');
    const [admin, member] = members as [Member, Member];

    for (const target of [member, admin]) {
      const res = await changeRole(workspaceId, admin, target.user.id, { role: 'OWNER' });
      expect(res.status).toBe(403);
    }
    expect(await ownerCount(workspaceId)).toBe(1);
  });

  it.each(['MEMBER', 'VIEWER'] as const)('403 for a %s', async (role) => {
    const { workspaceId, members } = await workspaceWith(role, 'VIEWER');

    const res = await changeRole(workspaceId, members[0]!, members[1]!.user.id, {
      role: 'MEMBER',
    });

    expect(res.status).toBe(403);
    expect(await roleOf(workspaceId, members[1]!.user.id)).toBe('VIEWER');
  });

  it('422 LAST_OWNER: the only OWNER cannot demote themselves', async () => {
    const { workspaceId, owner } = await workspaceWith('ADMIN');

    expectLastOwner(await changeRole(workspaceId, owner, owner.user.id, { role: 'ADMIN' }));
    expect(await roleOf(workspaceId, owner.user.id)).toBe('OWNER');
  });

  it('with two OWNERs one may demote the other, but not the last one', async () => {
    const { workspaceId, owner, members } = await workspaceWith('OWNER');
    const second = members[0]!;

    const first = await changeRole(workspaceId, owner, second.user.id, { role: 'MEMBER' });
    expect(first.status).toBe(200);

    expectLastOwner(await changeRole(workspaceId, owner, owner.user.id, { role: 'MEMBER' }));
    expect(await ownerCount(workspaceId)).toBe(1);
  });

  it('two OWNERs demoting each other at once leave exactly one OWNER', async () => {
    const { workspaceId, owner, members } = await workspaceWith('OWNER');
    const second = members[0]!;

    const responses = await Promise.all([
      changeRole(workspaceId, owner, second.user.id, { role: 'ADMIN' }),
      changeRole(workspaceId, second, owner.user.id, { role: 'ADMIN' }),
    ]);

    // The loser's role is re-read after the winner commits: it is now an ADMIN acting on an OWNER.
    expect(responses.map((res) => res.status).sort()).toEqual([200, 403]);
    expect(await ownerCount(workspaceId)).toBe(1);
  });

  it('an OWNER demoted at the same time cannot grant OWNER', async () => {
    const { workspaceId, owner, members } = await workspaceWith('OWNER', 'MEMBER');
    const [second, member] = members as [Member, Member];

    const responses = await Promise.all([
      changeRole(workspaceId, owner, second.user.id, { role: 'ADMIN' }),
      changeRole(workspaceId, second, member.user.id, { role: 'OWNER' }),
    ]);

    const secondIsOwner = (await roleOf(workspaceId, second.user.id)) === 'OWNER';
    const memberIsOwner = (await roleOf(workspaceId, member.user.id)) === 'OWNER';
    // Either the grant ran first (both succeed) or the demotion did (the grant is refused).
    if (responses[1].status === 200) expect(memberIsOwner).toBe(true);
    else expect(responses[1].status).toBe(403);
    expect(secondIsOwner).toBe(false);
  });

  it.each(invalidRoleBodies)('400 for $case', async ({ body }) => {
    const { workspaceId, owner, members } = await workspaceWith('MEMBER');

    const res = await changeRole(workspaceId, owner, members[0]!.user.id, body);

    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('404 for a target who is not a member', async () => {
    const { workspaceId, owner } = await workspaceWith();
    const stranger = await createUserWithToken();

    const res = await changeRole(workspaceId, owner, stranger.user.id, { role: 'ADMIN' });

    expect(res.status).toBe(404);
    expect(await roleOf(workspaceId, stranger.user.id)).toBeUndefined();
  });

  it('404 for a non-member caller', async () => {
    const { workspaceId, members } = await workspaceWith('MEMBER');
    const outsider = await createUserWithToken();

    const res = await changeRole(workspaceId, outsider, members[0]!.user.id, { role: 'ADMIN' });

    expect(res.status).toBe(404);
    expect(await roleOf(workspaceId, members[0]!.user.id)).toBe('MEMBER');
  });

  it('401 without a token', async () => {
    const { workspaceId, members } = await workspaceWith('MEMBER');

    const res = await request(app)
      .patch(memberPath(workspaceId, members[0]!.user.id))
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/v1/workspaces/:workspaceId/members/:userId', () => {
  it.each([
    ['OWNER', 'ADMIN'],
    ['OWNER', 'VIEWER'],
    ['ADMIN', 'MEMBER'],
    ['ADMIN', 'ADMIN'],
  ] as const)('204: a %s removes a %s', async (actorRole, targetRole) => {
    const { workspaceId, owner, members } = await workspaceWith('ADMIN', targetRole);
    const actor = actorRole === 'OWNER' ? owner : members[0]!;
    const target = members[1]!;

    const res = await remove(workspaceId, actor, target.user.id);

    expect(res.status).toBe(204);
    expect(await roleOf(workspaceId, target.user.id)).toBeUndefined();
  });

  it('an OWNER removes another OWNER', async () => {
    const { workspaceId, owner, members } = await workspaceWith('OWNER');

    expect((await remove(workspaceId, owner, members[0]!.user.id)).status).toBe(204);
    expect(await ownerCount(workspaceId)).toBe(1);
  });

  it.each(['ADMIN', 'MEMBER', 'VIEWER'] as const)('204: a %s leaves', async (role) => {
    const { workspaceId, members } = await workspaceWith(role);
    const member = members[0]!;

    expect((await remove(workspaceId, member, member.user.id)).status).toBe(204);
    const list = await request(app).get(paths.workspaces).set(bearer(member.token));
    expect(list.body.data).toEqual([]);
  });

  it('403: an ADMIN cannot remove an OWNER', async () => {
    const { workspaceId, owner, members } = await workspaceWith('ADMIN');

    expect((await remove(workspaceId, members[0]!, owner.user.id)).status).toBe(403);
    expect(await roleOf(workspaceId, owner.user.id)).toBe('OWNER');
  });

  it.each(['MEMBER', 'VIEWER'] as const)('403: a %s cannot remove someone else', async (role) => {
    const { workspaceId, members } = await workspaceWith(role, 'VIEWER');

    expect((await remove(workspaceId, members[0]!, members[1]!.user.id)).status).toBe(403);
    expect(await roleOf(workspaceId, members[1]!.user.id)).toBe('VIEWER');
  });

  it('422 LAST_OWNER: the only OWNER cannot leave', async () => {
    const { workspaceId, owner } = await workspaceWith('ADMIN');

    expectLastOwner(await remove(workspaceId, owner, owner.user.id));
    expect(await roleOf(workspaceId, owner.user.id)).toBe('OWNER');
  });

  it('an OWNER may leave while another OWNER stays', async () => {
    const { workspaceId, owner } = await workspaceWith('OWNER');

    expect((await remove(workspaceId, owner, owner.user.id)).status).toBe(204);
    expect(await ownerCount(workspaceId)).toBe(1);
  });

  it('two OWNERs leaving at once leave exactly one OWNER', async () => {
    const { workspaceId, owner, members } = await workspaceWith('OWNER');
    const second = members[0]!;

    const responses = await Promise.all([
      remove(workspaceId, owner, owner.user.id),
      remove(workspaceId, second, second.user.id),
    ]);

    expect(responses.map((res) => res.status).sort()).toEqual([204, 422]);
    expect(await ownerCount(workspaceId)).toBe(1);
  });

  it('404 for a target who is not a member', async () => {
    const { workspaceId, owner } = await workspaceWith();
    const stranger = await createUserWithToken();

    expect((await remove(workspaceId, owner, stranger.user.id)).status).toBe(404);
  });

  it('404 for a non-member caller', async () => {
    const { workspaceId, members } = await workspaceWith('MEMBER');
    const outsider = await createUserWithToken();

    expect((await remove(workspaceId, outsider, members[0]!.user.id)).status).toBe(404);
    expect(await roleOf(workspaceId, members[0]!.user.id)).toBe('MEMBER');
  });

  it('401 without a token', async () => {
    const { workspaceId, members } = await workspaceWith('MEMBER');

    const res = await request(app).delete(memberPath(workspaceId, members[0]!.user.id));

    expect(res.status).toBe(401);
  });
});
