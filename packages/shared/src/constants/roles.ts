// Workspace roles and plans (docs/api/README.md → Authorization model, docs/database/schema.md).
// Same values as the Prisma enums `Role` and `Plan`.

/** Highest first: OWNER > ADMIN > MEMBER > VIEWER. */
export const ROLE_ORDER = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;
export type Role = (typeof ROLE_ORDER)[number];

export const PLANS = ['FREE', 'PRO'] as const;
export type Plan = (typeof PLANS)[number];

/** Whether `actual` is at least `min` in ROLE_ORDER (e.g. hasRole('ADMIN', 'MEMBER') → true). */
export const hasRole = (actual: Role, min: Role) =>
  ROLE_ORDER.indexOf(actual) <= ROLE_ORDER.indexOf(min);
