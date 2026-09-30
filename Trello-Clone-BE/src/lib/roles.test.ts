import { ROLE_ORDER } from '@trello-clone/shared';
import { describe, expect, it } from 'vitest';

import { hasRole } from './roles';

describe('hasRole', () => {
  it('compares by ROLE_ORDER (OWNER > ADMIN > MEMBER > VIEWER)', () => {
    for (const [i, actual] of ROLE_ORDER.entries()) {
      for (const [j, min] of ROLE_ORDER.entries()) {
        expect(hasRole(actual, min), `${actual} ≥ ${min}`).toBe(i <= j);
      }
    }
  });
});
