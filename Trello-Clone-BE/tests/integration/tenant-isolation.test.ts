import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma';
import { paths } from '../data/http';
import { boardData, tenantData } from '../data/workspaces';
import { resetDb, testPrisma } from '../helpers/db';
import { createTestApp } from '../helpers/test-app';
import { createTwoTenants, snapshotWorkspace, type Tenant } from '../helpers/two-tenants';
import { bearer } from '../helpers/users';

import type { Express } from 'express';

// Tenant isolation (WORKSPACE-006, docs/api/README.md → Tenant isolation rules): tenant A, the
// OWNER of their own workspace, calls every /workspaces/* and /invites/* endpoint against tenant
// B's data. Each call must reveal nothing (404, or no trace of B) and leave B's rows unchanged.
// New endpoints add a case here; the coverage test below walks the whole app and fails until they
// do.

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
  /** Checks the response reveals nothing of B (default: a 404 identical to `missing`'s). */
  expectResponse?: (res: request.Response, b: Tenant) => void;
  /**
   * The same request with B's id replaced by one nothing has: the two 404 bodies must be equal,
   * so a foreign id never looks different from a missing one (isolation rule 3).
   */
  missing?: (a: Tenant) => request.Test;
}

const ws = (workspaceId: string) => `${paths.workspaces}/${workspaceId}`;
const expect404 = (res: request.Response) => {
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('NOT_FOUND');
};

/** The error body without the per-request id. */
const errorOf = (res: request.Response) => ({ ...res.body.error, requestId: null });

/** Nothing identifying tenant B appears in the response. */
const expectNoTraceOf = (res: request.Response, b: Tenant) => {
  expect(res.status).toBe(200);
  const body = JSON.stringify(res.body);
  for (const value of [
    b.workspaceId,
    b.owner.user.id,
    b.member.user.id,
    b.inviteId,
    b.boardId,
    tenantData.inviteEmail.b,
  ]) {
    expect(body).not.toContain(value);
  }
};

const { missingId } = tenantData;

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
    attempt: "create with B's name: the slug collision gives A a new workspace, not B's",
    request: (a) =>
      request(app)
        .post(paths.workspaces)
        .set(bearer(a.owner.token))
        .send({ name: tenantData.workspaceName.b }),
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
    missing: (a) => request(app).get(ws(missingId)).set(bearer(a.owner.token)),
  },
  {
    route: 'PATCH /workspaces/:workspaceId',
    attempt: "rename B's workspace",
    request: (a, b) =>
      request(app).patch(ws(b.workspaceId)).set(bearer(a.owner.token)).send(tenantData.rename),
    missing: (a) =>
      request(app).patch(ws(missingId)).set(bearer(a.owner.token)).send(tenantData.rename),
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
    missing: (a) => request(app).delete(ws(missingId)).set(bearer(a.owner.token)),
  },
  {
    route: 'GET /workspaces/:workspaceId/members',
    attempt: "list B's members",
    request: (a, b) =>
      request(app)
        .get(`${ws(b.workspaceId)}/members`)
        .set(bearer(a.owner.token)),
    missing: (a) =>
      request(app)
        .get(`${ws(missingId)}/members`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'GET /workspaces/:workspaceId/members',
    attempt: "list A's own members: none of B's appear (rule 5)",
    request: (a) =>
      request(app)
        .get(`${ws(a.workspaceId)}/members`)
        .set(bearer(a.owner.token)),
    expectResponse: expectNoTraceOf,
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
    missing: (a) =>
      request(app)
        .patch(`${ws(a.workspaceId)}/members/${missingId}`)
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
    missing: (a) =>
      request(app)
        .get(`${ws(missingId)}/invites`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'GET /workspaces/:workspaceId/invites',
    attempt: "list A's own invites: none of B's appear (rule 5)",
    request: (a) =>
      request(app)
        .get(`${ws(a.workspaceId)}/invites`)
        .set(bearer(a.owner.token)),
    expectResponse: expectNoTraceOf,
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
    missing: (a) =>
      request(app)
        .delete(`${ws(a.workspaceId)}/invites/${missingId}`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'POST /invites/accept',
    attempt: "accept B's invite (someone else's email)",
    request: (a, b) =>
      request(app)
        .post(paths.invitesAccept)
        .set(bearer(a.owner.token))
        .send({ token: b.inviteToken }),
  },
  {
    route: 'GET /workspaces/:workspaceId/boards',
    attempt: "list B's boards",
    request: (a, b) =>
      request(app)
        .get(`${ws(b.workspaceId)}/boards`)
        .set(bearer(a.owner.token)),
    missing: (a) =>
      request(app)
        .get(`${ws(missingId)}/boards`)
        .set(bearer(a.owner.token)),
  },
  {
    route: 'GET /workspaces/:workspaceId/boards',
    attempt: "list A's own boards: none of B's appear (rule 5)",
    request: (a) =>
      request(app)
        .get(`${ws(a.workspaceId)}/boards`)
        .set(bearer(a.owner.token)),
    expectResponse: expectNoTraceOf,
  },
  {
    route: 'POST /workspaces/:workspaceId/boards',
    attempt: "create a board in B's workspace",
    request: (a, b) =>
      request(app)
        .post(`${ws(b.workspaceId)}/boards`)
        .set(bearer(a.owner.token))
        .send({ title: boardData.tenantBoard.a }),
    missing: (a) =>
      request(app)
        .post(`${ws(missingId)}/boards`)
        .set(bearer(a.owner.token))
        .send({ title: boardData.tenantBoard.a }),
  },
];

describe('tenant isolation: A against B', () => {
  it.each(cases)('$route: $attempt', async ({ request: send, expectResponse, missing }) => {
    const { a, b } = await createTwoTenants(app);
    const before = await snapshotWorkspace(b.workspaceId);

    const res = await send(a, b);

    if (expectResponse) expectResponse(res, b);
    else expect404(res);
    if (missing) expect(errorOf(res)).toEqual(errorOf(await missing(a)));
    expect(await snapshotWorkspace(b.workspaceId)).toEqual(before);
  });
});

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

/** `METHOD /path` of every route in the app, descending into mounted routers. */
const routesIn = (stack: Layer[]): string[] =>
  stack.flatMap((layer) => {
    if (layer.route) {
      const { path, methods } = layer.route;
      return Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`);
    }
    return layer.handle?.stack ? routesIn(layer.handle.stack) : [];
  });

describe('tenant isolation coverage', () => {
  it('has a case for every /workspaces/* and /invites/* route in the app', () => {
    const appRouter = (createTestApp() as unknown as { router: { stack: Layer[] } }).router;
    const registered = routesIn(appRouter.stack).filter((route) =>
      /^[A-Z]+ \/(workspaces|invites)(\/|$)/.test(route),
    );
    const covered = new Set(cases.map((c) => c.route));

    expect(registered.length).toBeGreaterThan(0);
    expect(registered.filter((route) => !covered.has(route))).toEqual([]);
    expect([...covered].filter((route) => !registered.includes(route))).toEqual([]);
  });
});
