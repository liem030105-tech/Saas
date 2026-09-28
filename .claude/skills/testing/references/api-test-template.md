# API integration test template (Vitest 4 + Supertest)

Location: `Trello-Clone-BE/tests/integration/<module>.test.ts`. Runs against the test database (`DATABASE_URL_TEST`, name ends in `_test`); never mock Prisma.
Helpers (created in FOUNDATION-004 / AUTH-001 / WORKSPACE-005): `tests/helpers/db.ts` (`resetDb`), `tests/helpers/app.ts` (`api` = Supertest agent on `createApp()`), `tests/helpers/auth.ts` (`loginAs`), `tests/factories/*` (`createUser`, `createWorkspace`, …). Use them; do not build fixtures inline. If a helper does not exist yet, create it there rather than in the test file.

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { createUser, createWorkspace } from '../factories';
import { api } from '../helpers/app';
import { loginAs } from '../helpers/auth';
import { resetDb } from '../helpers/db';

describe('POST /api/v1/workspaces/:workspaceId/boards', () => {
  beforeEach(resetDb);

  const url = (workspaceId: string) => `/api/v1/workspaces/${workspaceId}/boards`;

  it('creates a board for a MEMBER (happy path)', async () => {
    const { user, workspace } = await createWorkspace({ role: 'MEMBER' });
    const res = await api.post(url(workspace.id)).set(await loginAs(user)).send({ title: 'Roadmap' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ workspaceId: workspace.id, title: 'Roadmap', archived: false });
  });

  it('rejects invalid input with 400 VALIDATION_ERROR', async () => {
    const { user, workspace } = await createWorkspace({ role: 'MEMBER' });
    const res = await api.post(url(workspace.id)).set(await loginAs(user)).send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(res.body.error.details[0].path).toBe('title');
  });

  it('returns 401 without a token', async () => {
    const { workspace } = await createWorkspace({ role: 'MEMBER' });
    const res = await api.post(url(workspace.id)).send({ title: 'Roadmap' });
    expect(res.status).toBe(401);
  });

  it('returns 404 to a non-member (existence is not leaked)', async () => {
    const { workspace } = await createWorkspace({ role: 'OWNER' });
    const outsider = await createUser();
    const res = await api.post(url(workspace.id)).set(await loginAs(outsider)).send({ title: 'Roadmap' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 403 to a VIEWER', async () => {
    const { user, workspace } = await createWorkspace({ role: 'VIEWER' });
    const res = await api.post(url(workspace.id)).set(await loginAs(user)).send({ title: 'Roadmap' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
```
Then add the endpoint-specific cases listed in `docs/api/<module>.md` → "Required tests", and register the endpoint in the role-matrix and tenant-isolation suites.

## Rules of thumb
- Assert status **and** body (`error.code`, the fields the spec promises), never only the status.
- Assert side effects in the DB when the spec has them (activity row written, token revoked).
- Integration files run serially (`fileParallelism: false` or a single fork), each resetting the DB.
