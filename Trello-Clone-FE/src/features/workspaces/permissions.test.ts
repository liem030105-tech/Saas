import { ROLE_ORDER } from '@trello-clone/shared';

import {
  assignableRoles,
  can,
  canManageMember,
  WORKSPACE_VISIBILITY,
  type WorkspaceAction,
} from './permissions';
import matrix from '../../../../packages/shared/tests/data/permission-matrix.json';

// The UI copy must match the permission matrix, the same fixture the BE map is tested against
// (WORKSPACE-005 → Risks: no drift between FE visibility and the BE map).

describe('WORKSPACE_VISIBILITY', () => {
  it('has exactly the matrix actions', () => {
    expect(Object.keys(WORKSPACE_VISIBILITY).sort()).toEqual(
      matrix.rows.map((row) => row.action).sort(),
    );
  });

  it.each(matrix.rows)('$action: shown to $allowed', ({ action, allowed }) => {
    for (const role of ROLE_ORDER) {
      expect(can(role, action as WorkspaceAction), role).toBe(allowed.includes(role));
    }
  });
});

describe('member footnotes', () => {
  it('only an OWNER manages an OWNER; nobody below ADMIN manages anyone', () => {
    expect(canManageMember('OWNER', 'OWNER')).toBe(true);
    expect(canManageMember('ADMIN', 'OWNER')).toBe(false);
    expect(canManageMember('ADMIN', 'ADMIN')).toBe(true);
    expect(canManageMember('MEMBER', 'VIEWER')).toBe(false);
  });

  it('only an OWNER can assign Owner', () => {
    expect(assignableRoles('OWNER')).toContain('OWNER');
    expect(assignableRoles('ADMIN')).not.toContain('OWNER');
  });
});
