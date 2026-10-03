import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { testPrisma } from './db';
import { bearer, createUserWithToken } from './users';
import { paths } from '../data/http';
import { roleMatrixData } from '../data/workspaces';

import type { Role } from '@trello-clone/shared';
import type { Express } from 'express';

// Role-matrix harness (WORKSPACE-005): runs one endpoint as every kind of caller and asserts the
// status code each gets. Later tasks (boards, lists, cards) reuse it for their endpoints.

export type MatrixCaller = Role | 'NON_MEMBER';

export const MATRIX_CALLERS: readonly MatrixCaller[] = [
  'OWNER',
  'ADMIN',
  'MEMBER',
  'VIEWER',
  'NON_MEMBER',
];

type User = Awaited<ReturnType<typeof createUserWithToken>>;

/** What a matrix case can use to build its request. */
export interface MatrixContext {
  app: Express;
  workspaceId: string;
  /** The workspace's creator, its only OWNER unless the case's setup adds more. */
  owner: User;
  /** Who sends the request: `owner` for OWNER, a new user with that role, or a non-member. */
  caller: User;
  /** Whatever the case's `setup` returned (a target member, an invite, …). */
  fixture: Record<string, string>;
}

/** `METHOD /path` of every registered case (a name's text before " (…)"), for the coverage test. */
export const matrixRoutes = new Set<string>();

export interface MatrixCase {
  /** e.g. `PATCH /workspaces/:workspaceId`. */
  name: string;
  /** Extra rows the request needs, created by the owner before each run. */
  setup?: (ctx: Omit<MatrixContext, 'caller' | 'fixture'>) => Promise<Record<string, string>>;
  request: (ctx: MatrixContext) => request.Test;
  /** The expected status code for each kind of caller. */
  expected: Record<MatrixCaller, number>;
}

/** A workspace created by a new owner through the API (so the OWNER membership is real). */
async function workspaceFor(app: Express) {
  const owner = await createUserWithToken();
  const res = await request(app)
    .post(paths.workspaces)
    .set(bearer(owner.token))
    .send({ name: roleMatrixData.workspaceName })
    .expect(201);
  return { owner, workspaceId: res.body.data.id as string };
}

async function callerFor(kind: MatrixCaller, workspaceId: string, owner: User) {
  if (kind === 'OWNER') return owner;
  const user = await createUserWithToken();
  if (kind !== 'NON_MEMBER') {
    await testPrisma.workspaceMember.create({
      data: { userId: user.user.id, workspaceId, role: kind },
    });
  }
  return user;
}

/**
 * Registers one test per caller kind for `matrixCase`: a fresh workspace (and setup) each time, so
 * a request that changes state (a delete, a role change) never affects the next caller.
 */
export function describeRoleMatrix(getApp: () => Express, matrixCase: MatrixCase) {
  matrixRoutes.add(matrixCase.name.split(' (')[0]!);
  describe(`${matrixCase.name} role matrix`, () => {
    it.each(MATRIX_CALLERS)('%s', async (kind) => {
      const app = getApp();
      const { owner, workspaceId } = await workspaceFor(app);
      const fixture = (await matrixCase.setup?.({ app, workspaceId, owner })) ?? {};
      const caller = await callerFor(kind, workspaceId, owner);

      const res = await matrixCase.request({ app, workspaceId, owner, caller, fixture });

      expect(res.status, JSON.stringify(res.body)).toBe(matrixCase.expected[kind]);
    });
  });
}
