import { buildErrorBody } from './api';

import type { WorkspaceDto } from '@trello-clone/shared';

/** Workspaces as GET /workspaces returns them (ordered by name). */
export const acmeWorkspace: WorkspaceDto = {
  id: 'clx0000000000000000000011',
  name: 'Acme Team',
  slug: 'acme-team',
  plan: 'FREE',
  createdAt: '2026-09-30T10:00:00.000Z',
  role: 'OWNER',
};

export const betaWorkspace: WorkspaceDto = {
  id: 'clx0000000000000000000012',
  name: 'Beta Squad',
  slug: 'beta-squad',
  plan: 'FREE',
  createdAt: '2026-09-30T11:00:00.000Z',
  role: 'MEMBER',
};

/** What the user types and what POST /workspaces receives (the name is trimmed). */
export const newWorkspaceInput = { typed: '  Acme Team ', sent: { name: 'Acme Team' } };

export const blankNameMessage = 'Enter a workspace name';

export const unknownWorkspaceSlug = 'no-such-workspace';

export const workspaceServerError = buildErrorBody({
  code: 'INTERNAL_ERROR',
  message: 'Something went wrong',
  details: [],
});

export const workspacePathFor = (workspace: Pick<WorkspaceDto, 'slug'>) => `/w/${workspace.slug}`;
