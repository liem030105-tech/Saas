// Workspace roles and plans (docs/api/README.md → Authorization model, docs/database/schema.md).
// Same values as the Prisma enums `Role` and `Plan`.

/** Highest first: OWNER > ADMIN > MEMBER > VIEWER. */
export const ROLE_ORDER = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;
export type Role = (typeof ROLE_ORDER)[number];

export const PLANS = ['FREE', 'PRO'] as const;
export type Plan = (typeof PLANS)[number];
