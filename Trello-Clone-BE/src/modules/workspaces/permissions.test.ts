import { ROLE_ORDER } from '@trello-clone/shared';
import { describe, expect, it } from 'vitest';

import { hasPermission, WORKSPACE_PERMISSIONS, type WorkspaceAction } from './permissions';
import matrix from '../../../../packages/shared/tests/data/permission-matrix.json';

// The map must match the permission matrix exactly (WORKSPACE-005 → Testing, Risks).

describe('WORKSPACE_PERMISSIONS', () => {
  it('has exactly the matrix actions', () => {
    expect(Object.keys(WORKSPACE_PERMISSIONS).sort()).toEqual(
      matrix.rows.map((row) => row.action).sort(),
    );
  });

  it.each(matrix.rows)('$action: allowed for $allowed', ({ action, allowed }) => {
    for (const role of ROLE_ORDER) {
      expect(hasPermission(role, action as WorkspaceAction), role).toBe(allowed.includes(role));
    }
  });
});
