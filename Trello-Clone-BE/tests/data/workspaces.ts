// Workspace test data (WORKSPACE-001).

export const workspaceNames = {
  acme: { input: '  Acme Team ', stored: 'Acme Team', slug: 'acme-team' },
  /** Accents are dropped from the slug. */
  accented: { input: 'Đội Phát triển', slug: 'doi-phat-trien' },
  /** Nothing usable for a slug: falls back to "workspace". */
  noLatin: { input: '工作区', slug: 'workspace' },
  /** Shorter than the 3-char slug minimum: gets a suffix. */
  short: { input: 'A' },
  long: { input: `${'Long name '.repeat(9)}end` },
};

/** Names in an order that is not alphabetical, to check GET /workspaces sorting. */
export const unsortedNames = ['Zeta', 'alpha', 'Beta'];

/** One invalid POST /workspaces body per rule; each must fail with 400. */
export const invalidWorkspaceBodies = [
  { case: 'missing name', body: {} },
  { case: 'blank name', body: { name: '   ' } },
  { case: 'name over 100 chars', body: { name: 'n'.repeat(101) } },
  { case: 'name not a string', body: { name: 42 } },
] as const;

/** Fields a client might try to set on create; they are stripped (slug and plan are server-side). */
export const forbiddenCreateFields = { slug: 'chosen-by-client', plan: 'PRO' };

/** Matches a generated slug with a random suffix, e.g. `acme-team-x9k2`. */
export const suffixedSlug = (base: string) => new RegExp(`^${base}-[a-z0-9]{4}$`);

/** Workspaces created in the list and role tests. */
export const otherUsersWorkspaceName = 'Other team';
export const sharedWorkspaceName = 'Shared';
export const roleTestWorkspaceName = 'Team';

/** A well-formed id no workspace has, and an id that is not a cuid: both look like a non-member. */
export const unknownWorkspaceId = 'clx0000000000000000000099';
export const malformedWorkspaceId = 'not-a-cuid';

/** PATCH /workspaces/:workspaceId (WORKSPACE-002). */
export const workspaceUpdate = {
  rename: { input: '  Renamed Team ', stored: 'Renamed Team' },
  slug: 'renamed-team',
  /** Another workspace's slug, taken by the time the PATCH runs. */
  takenSlugOwnerName: 'Taken',
};

/** One invalid PATCH body per rule; each must fail with 400. */
export const invalidWorkspaceUpdates = [
  { case: 'no field', body: {} },
  { case: 'blank name', body: { name: '   ' } },
  { case: 'slug with spaces and capitals', body: { slug: 'Bad Slug' } },
  { case: 'slug under 3 chars', body: { slug: 'ab' } },
] as const;

/** Members tests (WORKSPACE-003). Names are out of order on purpose, to check sorting. */
export const memberNames = { owner: 'Olivia Owner', admin: 'zed Admin', admin2: 'Amy Admin' };
export const membersWorkspaceName = 'Members';

/** One invalid PATCH …/members/:userId body per rule; each must fail with 400. */
export const invalidRoleBodies = [
  { case: 'missing role', body: {} },
  { case: 'unknown role', body: { role: 'GUEST' } },
  { case: 'lower-case role', body: { role: 'admin' } },
] as const;

/** Invitations tests (WORKSPACE-004). */
export const invitesWorkspaceName = 'Invites';
export const inviteeEmail = {
  typed: '  New.Person@Example.TEST ',
  stored: 'new.person@example.test',
};

/** One invalid POST …/invites body per rule; each must fail with 400. */
export const invalidInviteBodies = [
  {
    case: 'OWNER role (invites never grant OWNER)',
    body: { email: 'a@example.test', role: 'OWNER' },
  },
  { case: 'invalid email', body: { email: 'not-an-email', role: 'MEMBER' } },
  { case: 'missing role', body: { email: 'a@example.test' } },
  { case: 'missing email', body: { role: 'MEMBER' } },
] as const;

/** A token no invite has. */
export const unknownInviteToken = 'bm8tc3VjaC1pbnZpdGUtdG9rZW4tYXQtYWxsLTAwMDAwMDAwMDA';
