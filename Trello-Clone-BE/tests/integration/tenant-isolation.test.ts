import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { API_PREFIX } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { invitesRouter } from '../../src/modules/workspaces/invites.routes';
import { workspacesRouter } from '../../src/modules/workspaces/workspaces.routes';
import { paths } from '../data/http';
import { tenantData } from '../data/workspaces';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { createTwoTenants, snapshotWorkspace, type Tenant } from '../helpers/two-tenants';
import { bearer } from '../helpers/users';

import type { Express, Router } from 'express';

// Tenant isolation (WORKSPACE-006, docs/api/README.md → Tenant isolation rules): tenant A, the
// OWNER of their own workspace, calls every /workspaces/* and /invites/* endpoint against tenant
// B's data. Each call must reveal nothing (404, or no trace of B) and leave B's rows unchanged.
// New endpoints add a case here; the coverage test below fails until they do.

let app: Express;

beforeAll(() => {
  app = createTestApp();
});
beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
  await testPrisma.$disconnect();
});

interface IsolationCase {
  /** `METHOD /route/pattern` exactly as registered, to match the coverage check. */
  route: string;
  /** What the case tries, for the test name. */
  attempt: string;
  request: (a: Tenant, b: Tenant) => request.Test;
  /** Checks the response reveals nothing of B (default: a 404). */
  expectResponse?: (res: request.Response, b: Tenant) => void;
}

const ws = (workspaceId: string) => `${paths.workspaces}/${workspaceId}`;
const expect404 = (res: request.Response) => {
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('NOT_FOUND');
};

const cases: IsolationCase[] = [
  {
    route: 'GET /workspaces',
    attempt: "list: B's workspace is not in A's list",
    request: (a) => request(app).get(paths.workspaces).set(bearer(a.owner.token)),
    expectResponse: (res, b) => {
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(b.workspaceId);
    },
  },
  {
    route: 'POST /workspaces',
    attempt: "create with B's slug: A gets a workspace of their own, not B's",
    request: (a, b) =>
      request(app)
        .post(paths.workspaces)
        .set(bearer(a.owner.token))
        .send({ name: tenantData.workspaceName.b, slug: b.slug }),
    expectResponse: (res, b) => {
      expect(res.status).toBe(201);
      expect(res.body.data.id).not.toBe(b.workspaceId);
      expect(res.body.data.slug).not.toBe(b.slug);
    },
  },
  {
    route: 'GET /workspaces/:workspaceId',
    attempt: "read B's workspace",
    request: (a, b) => request(app).get(ws(b.workspaceId)).set(bearer(a.owner.token)),
  },
  {
    route: 'PATCH /workspaces/:workspaceId',
    attempt: "rename B's workspace",
    request: (a, b) =>
      request(app).patch(ws(b.workspaceId)).set(bearer(a.owner.token)).send(tenantData.rename),
  },
  {
    route: 'PATCH /workspaces/:workspaceId',
    attempt: "take B's slug for A's own workspace (a 409 would be fine, B stays unchanged)",
    request: (a, b) =>
      request(app).patch(ws(a.workspaceId)).set(bearer(a.owner.token)).send({ slug: b.slug }),
    expectResponse: (res) => expect(res.status).toBe(409),
  },
  {
    route: 'DELETE /workspaces/:workspaceId',
    attempt: "delete B's workspace",
    request: (a, b) => request(app).delete(ws(b.workspaceId)).set(bearer(a.owner.token)),
  },
  {
    route: 'GET /workspaces/:workspaceId/members',
    attempt: "list B's members",
    request: (a, b) =>
      request(app)
        .get(`${ws(b.workspaceId)}/members`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'PATCH /workspaces/:workspaceId/members/:userId',
    attempt: "change a role in B's workspace",
    request: (a, b) =>
      request(app)
        .patch(`${ws(b.workspaceId)}/members/${b.member.user.id}`)
        .set(bearer(a.owner.token))
        .send(tenantData.roleChange),
  },
  {
    route: 'PATCH /workspaces/:workspaceId/members/:userId',
    attempt: "change B's member through A's own workspace",
    request: (a, b) =>
      request(app)
        .patch(`${ws(a.workspaceId)}/members/${b.member.user.id}`)
        .set(bearer(a.owner.token))
        .send(tenantData.roleChange),
  },
  {
    route: 'DELETE /workspaces/:workspaceId/members/:userId',
    attempt: "remove a member of B's workspace",
    request: (a, b) =>
      request(app)
        .delete(`${ws(b.workspaceId)}/members/${b.member.user.id}`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'DELETE /workspaces/:workspaceId/members/:userId',
    attempt: "remove B's owner through A's own workspace",
    request: (a, b) =>
      request(app)
        .delete(`${ws(a.workspaceId)}/members/${b.owner.user.id}`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'GET /workspaces/:workspaceId/invites',
    attempt: "list B's invites",
    request: (a, b) =>
      request(app)
        .get(`${ws(b.workspaceId)}/invites`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'POST /workspaces/:workspaceId/invites',
    attempt: "invite someone into B's workspace",
    request: (a, b) =>
      request(app)
        .post(`${ws(b.workspaceId)}/invites`)
        .set(bearer(a.owner.token))
        .send(tenantData.newInvite),
  },
  {
    route: 'DELETE /workspaces/:workspaceId/invites/:inviteId',
    attempt: "revoke an invite of B's workspace",
    request: (a, b) =>
      request(app)
        .delete(`${ws(b.workspaceId)}/invites/${b.inviteId}`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'DELETE /workspaces/:workspaceId/invites/:inviteId',
    attempt: "revoke B's invite through A's own workspace",
    request: (a, b) =>
      request(app)
        .delete(`${ws(a.workspaceId)}/invites/${b.inviteId}`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'POST /invites/accept',
    attempt: "accept B's invite (someone else's email)",
    request: (a, b) =>
      request(app)
        .post(`${API_PREFIX}/invites/accept`)
        .set(bearer(a.owner.token))
        .send({ token: b.inviteToken }),
  },
];

describe('tenant isolation: A against B', () => {
  it.each(cases)('$route: $attempt', async ({ request: send, expectResponse = expect404 }) => {
    const { a, b } = await createTwoTenants(app);
    const before = await snapshotWorkspace(b.workspaceId);

    const res = await send(a, b);

    expectResponse(res, b);
    expect(await snapshotWorkspace(b.workspaceId)).toEqual(before);
  });
});

/** `METHOD /path` for every route registered on `router`. */
const routesOf = (router: Router) =>
  router.stack.flatMap((layer) =>
    layer.route
      ? Object.keys((layer.route as unknown as { methods: Record<string, boolean> }).methods).map(
          (method) => `${method.toUpperCase()} ${layer.route!.path}`,
        )
      : [],
  );

describe('tenant isolation coverage', () => {
  it('has a case for every /workspaces/* and /invites/* route', () => {
    const registered = [...routesOf(workspacesRouter), ...routesOf(invitesRouter)];
    const covered = new Set(cases.map((c) => c.route));

    expect(registered.length).toBeGreaterThan(0);
    expect(registered.filter((route) => !covered.has(route))).toEqual([]);
    expect([...covered].filter((route) => !registered.includes(route))).toEqual([]);
  });
});
