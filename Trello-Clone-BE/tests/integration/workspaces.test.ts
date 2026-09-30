import { ErrorResponseSchema, WorkspaceDtoSchema } from '@trello-clone/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { API_PREFIX } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { assertWorkspaceAccess } from '../../src/modules/workspaces/workspaces.service';
import { paths } from '../data/http';
import {
  forbiddenCreateFields,
  invalidWorkspaceBodies,
  malformedWorkspaceId,
  otherUsersWorkspaceName,
  roleTestWorkspaceName,
  sharedWorkspaceName,
  suffixedSlug,
  unknownWorkspaceId,
  unsortedNames,
  workspaceNames,
} from '../data/workspaces';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { bearer, createUserWithToken } from '../helpers/users';

import type { Express } from 'express';

const WORKSPACES = paths.workspaces;
const adminOnlyPath = (workspaceId: string) =>
  `${API_PREFIX}${paths.workspaceAdminOnly.replace(':workspaceId', workspaceId)}`;

let app: Express;

beforeAll(() => {
  app = createTestApp();
});
beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
  await testPrisma.$disconnect();
});

const createWorkspace = (token: string, body: object) =>
  request(app).post(WORKSPACES).set(bearer(token)).send(body);

describe('POST /api/v1/workspaces', () => {
  it('201: creates the workspace with a slug, and the caller is its OWNER', async () => {
    const { user, token } = await createUserWithToken();

    const res = await createWorkspace(token, { name: workspaceNames.acme.input });

    expect(res.status).toBe(201);
    const workspace = WorkspaceDtoSchema.parse(res.body.data);
    expect(workspace).toMatchObject({
      name: workspaceNames.acme.stored,
      slug: workspaceNames.acme.slug,
      plan: 'FREE',
      role: 'OWNER',
    });
    const member = await testPrisma.workspaceMember.findUniqueOrThrow({
      where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
    });
    expect(member.role).toBe('OWNER');
  });

  it('ignores a client-chosen slug or plan', async () => {
    const { token } = await createUserWithToken();

    const res = await createWorkspace(token, {
      name: workspaceNames.acme.input,
      ...forbiddenCreateFields,
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ slug: workspaceNames.acme.slug, plan: 'FREE' });
  });

  it('gives the same name a new slug with a random suffix', async () => {
    const { token } = await createUserWithToken();
    await createWorkspace(token, { name: workspaceNames.acme.input }).expect(201);

    const second = await createWorkspace(token, { name: workspaceNames.acme.input });

    expect(second.status).toBe(201);
    expect(second.body.data.slug).toMatch(suffixedSlug(workspaceNames.acme.slug));
  });

  it('creates unique slugs when the same name is created concurrently', async () => {
    const { token } = await createUserWithToken();

    const responses = await Promise.all(
      Array.from({ length: 4 }, () => createWorkspace(token, { name: workspaceNames.acme.input })),
    );

    expect(responses.map((res) => res.status)).toEqual([201, 201, 201, 201]);
    const slugs = responses.map((res) => res.body.data.slug as string);
    expect(new Set(slugs).size).toBe(4);
  });

  it('slugs names without Latin letters', async () => {
    const { token } = await createUserWithToken();

    const res = await createWorkspace(token, { name: workspaceNames.noLatin.input });

    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe(workspaceNames.noLatin.slug);
  });

  it.each(invalidWorkspaceBodies)('400 for $case', async ({ body }) => {
    const { token } = await createUserWithToken();

    const res = await createWorkspace(token, body);

    expect(res.status).toBe(400);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    expect(await testPrisma.workspace.count()).toBe(0);
  });

  it('401 without a token', async () => {
    const res = await request(app).post(WORKSPACES).send({ name: workspaceNames.acme.input });

    expect(res.status).toBe(401);
    expect(await testPrisma.workspace.count()).toBe(0);
  });
});

describe('GET /api/v1/workspaces', () => {
  it('200: only the caller’s workspaces, ordered by name, with the caller’s role', async () => {
    const owner = await createUserWithToken();
    const other = await createUserWithToken();
    for (const name of unsortedNames) await createWorkspace(owner.token, { name }).expect(201);
    const othersWorkspace = await createWorkspace(other.token, {
      name: otherUsersWorkspaceName,
    }).expect(201);

    const res = await request(app).get(WORKSPACES).set(bearer(owner.token));

    expect(res.status).toBe(200);
    const workspaces = WorkspaceDtoSchema.array().parse(res.body.data);
    expect(workspaces.map((w) => w.name)).toEqual(
      [...unsortedNames].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
    );
    expect(workspaces.every((w) => w.role === 'OWNER')).toBe(true);
    expect(workspaces.map((w) => w.id)).not.toContain(othersWorkspace.body.data.id);
  });

  it('shows the caller’s own role in a workspace they joined', async () => {
    const owner = await createUserWithToken();
    const viewer = await createUserWithToken();
    const created = await createWorkspace(owner.token, { name: sharedWorkspaceName }).expect(201);
    await testPrisma.workspaceMember.create({
      data: { userId: viewer.user.id, workspaceId: created.body.data.id, role: 'VIEWER' },
    });

    const res = await request(app).get(WORKSPACES).set(bearer(viewer.token));

    expect(res.body.data).toEqual([
      expect.objectContaining({ name: sharedWorkspaceName, role: 'VIEWER' }),
    ]);
  });

  it('200 with an empty list for a new user', async () => {
    const { token } = await createUserWithToken();

    const res = await request(app).get(WORKSPACES).set(bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('401 without a token', async () => {
    expect((await request(app).get(WORKSPACES)).status).toBe(401);
  });
});

describe('requireWorkspaceRole / assertWorkspaceAccess', () => {
  async function workspaceWithMember(role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER') {
    const owner = await createUserWithToken();
    const created = await createWorkspace(owner.token, { name: roleTestWorkspaceName }).expect(201);
    const workspaceId = created.body.data.id as string;
    if (role === 'OWNER') return { workspaceId, member: owner };
    const member = await createUserWithToken();
    await testPrisma.workspaceMember.create({
      data: { userId: member.user.id, workspaceId, role },
    });
    return { workspaceId, member };
  }

  it.each(['OWNER', 'ADMIN'] as const)('lets a %s through an ADMIN-only route', async (role) => {
    const { workspaceId, member } = await workspaceWithMember(role);

    const res = await request(app).get(adminOnlyPath(workspaceId)).set(bearer(member.token));

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe(role);
  });

  it.each(['MEMBER', 'VIEWER'] as const)('403 FORBIDDEN for a %s', async (role) => {
    const { workspaceId, member } = await workspaceWithMember(role);

    const res = await request(app).get(adminOnlyPath(workspaceId)).set(bearer(member.token));

    expect(res.status).toBe(403);
    expect(ErrorResponseSchema.parse(res.body).error.code).toBe('FORBIDDEN');
  });

  it('404 NOT_FOUND for a non-member, identical to an unknown or malformed workspace id', async () => {
    const { workspaceId } = await workspaceWithMember('OWNER');
    const outsider = await createUserWithToken();

    const responses = await Promise.all(
      [workspaceId, unknownWorkspaceId, malformedWorkspaceId].map((id) =>
        request(app).get(adminOnlyPath(id)).set(bearer(outsider.token)),
      ),
    );

    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(ErrorResponseSchema.parse(res.body).error.code).toBe('NOT_FOUND');
    }
    const bodies = responses.map(({ body }) => ({ ...body.error, requestId: null }));
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0]).toEqual(bodies[2]);
  });

  it('401 before any workspace lookup without a token', async () => {
    const { workspaceId } = await workspaceWithMember('OWNER');

    expect((await request(app).get(adminOnlyPath(workspaceId))).status).toBe(401);
  });

  it('assertWorkspaceAccess returns the role when it is high enough', async () => {
    const { workspaceId, member } = await workspaceWithMember('MEMBER');

    await expect(assertWorkspaceAccess(member.user.id, workspaceId, 'VIEWER')).resolves.toBe(
      'MEMBER',
    );
    await expect(assertWorkspaceAccess(member.user.id, workspaceId, 'ADMIN')).rejects.toMatchObject(
      { status: 403 },
    );
  });
});
