import { describe, expect, it } from 'vitest';

import {
  AcceptInviteInputSchema,
  ChangeMemberRoleInputSchema,
  CreatedInviteDtoSchema,
  CreateInviteInputSchema,
  InviteDtoSchema,
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

describe('invite schemas', () => {
  it('normalizes the email and accepts every role but OWNER', () => {
    expect(CreateInviteInputSchema.parse({ email: '  Ada@Example.TEST ', role: 'ADMIN' })).toEqual({
      email: 'ada@example.test',
      role: 'ADMIN',
    });
    for (const role of ['ADMIN', 'MEMBER', 'VIEWER']) {
      expect(CreateInviteInputSchema.safeParse({ email: 'a@b.test', role }).success).toBe(true);
    }
  });

  it.each(data.invalidInvites)('rejects %j', (input) => {
    expect(CreateInviteInputSchema.safeParse(input).success).toBe(false);
  });

  it('parses an invite, with the link only on the created one', () => {
    expect(InviteDtoSchema.parse(data.inviteDto)).toEqual(data.inviteDto);
    const created = { ...data.inviteDto, inviteUrl: 'http://localhost:5173/invite/abc' };
    expect(CreatedInviteDtoSchema.parse(created)).toEqual(created);
    expect(InviteDtoSchema.parse(created)).toEqual(data.inviteDto);
  });

  it('needs a token to accept', () => {
    expect(AcceptInviteInputSchema.safeParse({ token: 'abc' }).success).toBe(true);
    expect(AcceptInviteInputSchema.safeParse({ token: '' }).success).toBe(false);
    expect(AcceptInviteInputSchema.safeParse({}).success).toBe(false);
  });
});
