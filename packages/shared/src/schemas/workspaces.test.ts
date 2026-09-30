import { describe, expect, it } from 'vitest';

import {
  ChangeMemberRoleInputSchema,
  CreateWorkspaceInputSchema,
  MemberDtoSchema,
  UpdateWorkspaceInputSchema,
  WorkspaceDtoSchema,
  WorkspaceNameSchema,
  WorkspaceSlugSchema,
} from './workspaces';
import data from '../../tests/data/workspaces.json';

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

describe('UpdateWorkspaceInputSchema', () => {
  it.each(data.validUpdates)('accepts %j', (input) => {
    expect(UpdateWorkspaceInputSchema.safeParse(input).success).toBe(true);
  });

  it.each(data.invalidUpdates)('rejects %j', (input) => {
    expect(UpdateWorkspaceInputSchema.safeParse(input).success).toBe(false);
  });

  it('trims the name and strips unknown fields', () => {
    expect(UpdateWorkspaceInputSchema.parse({ name: ' Acme ', plan: 'PRO' })).toEqual({
      name: 'Acme',
    });
  });
});

describe('ChangeMemberRoleInputSchema / MemberDtoSchema', () => {
  it('accepts every role and rejects anything else', () => {
    for (const role of ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']) {
      expect(ChangeMemberRoleInputSchema.safeParse({ role }).success).toBe(true);
    }
    for (const role of ['GUEST', 'owner', undefined]) {
      expect(ChangeMemberRoleInputSchema.safeParse({ role }).success).toBe(false);
    }
  });

  it('parses a member and drops user fields beyond the public ones', () => {
    const withExtra = {
      ...data.memberDto,
      user: { ...data.memberDto.user, passwordHash: 'x', createdAt: '2026-09-30T10:00:00.000Z' },
    };
    expect(MemberDtoSchema.parse(withExtra)).toEqual(data.memberDto);
  });
});
