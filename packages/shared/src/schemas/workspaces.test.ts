import { describe, expect, it } from 'vitest';

import {
  CreateWorkspaceInputSchema,
  WorkspaceDtoSchema,
  WorkspaceNameSchema,
  WorkspaceSlugSchema,
} from './workspaces';
import data from '../../tests/data/workspaces.json';
import { hasRole, ROLE_ORDER } from '../constants/roles';

describe('WorkspaceNameSchema', () => {
  it.each(data.validNames)('accepts $input and trims it', ({ input, normalized }) => {
    expect(WorkspaceNameSchema.parse(input)).toBe(normalized);
  });

  it.each(data.invalidNames)('rejects %j', (name) => {
    expect(WorkspaceNameSchema.safeParse(name).success).toBe(false);
  });
});

describe('WorkspaceSlugSchema', () => {
  it.each(data.validSlugs)('accepts %s', (slug) => {
    expect(WorkspaceSlugSchema.safeParse(slug).success).toBe(true);
  });

  it.each(data.invalidSlugs)('rejects %j', (slug) => {
    expect(WorkspaceSlugSchema.safeParse(slug).success).toBe(false);
  });
});

describe('CreateWorkspaceInputSchema / WorkspaceDtoSchema', () => {
  it('keeps only the name', () => {
    expect(CreateWorkspaceInputSchema.parse({ name: ' Acme ', slug: 'x', plan: 'PRO' })).toEqual({
      name: 'Acme',
    });
  });

  it('parses a workspace with the caller role', () => {
    expect(WorkspaceDtoSchema.parse(data.workspaceDto)).toEqual(data.workspaceDto);
    expect(WorkspaceDtoSchema.safeParse({ ...data.workspaceDto, role: 'GUEST' }).success).toBe(
      false,
    );
  });
});

describe('hasRole', () => {
  it('compares by ROLE_ORDER (OWNER > ADMIN > MEMBER > VIEWER)', () => {
    for (const [i, actual] of ROLE_ORDER.entries()) {
      for (const [j, min] of ROLE_ORDER.entries()) {
        expect(hasRole(actual, min), `${actual} ≥ ${min}`).toBe(i <= j);
      }
    }
  });
});
