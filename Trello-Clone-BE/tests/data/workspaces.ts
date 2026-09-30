// Workspace test data (WORKSPACE-001).

export const workspaceNames = {
  acme: { input: '  Acme Team ', stored: 'Acme Team', slug: 'acme-team' },
  /** Accents are dropped from the slug. */
  accented: { input: 'Đội Phát triển', slug: 'doi-phat-trien' },
  /** Nothing usable for a slug: falls back to "workspace" (plus a suffix). */
  noLatin: { input: '工作区' },
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
