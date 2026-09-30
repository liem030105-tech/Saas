import { ROLE_ORDER } from '@trello-clone/shared';

import type { Role } from '../generated/prisma/client';

// Role order: docs/api/README.md → Authorization model (OWNER > ADMIN > MEMBER > VIEWER).

/** Whether `actual` is at least `min` (e.g. hasRole('ADMIN', 'MEMBER') → true). */
export const hasRole = (actual: Role, min: Role) =>
  ROLE_ORDER.indexOf(actual) <= ROLE_ORDER.indexOf(min);
