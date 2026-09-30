import { z } from 'zod';

import { EmailSchema, UserDtoSchema } from './auth';
import { CuidSchema } from './common';
import { PLANS, ROLE_ORDER } from '../constants/roles';

// Field rules: docs/api/README.md → Validation rules. Messages are shown in the UI (English).

export const WorkspaceNameSchema = z
  .string({ error: 'Enter a workspace name' })
  .trim()
  .min(1, 'Enter a workspace name')
  .max(100, 'Name must be at most 100 characters');

/** 3–50 chars: lower-case letters, digits and inner hyphens. */
export const WorkspaceSlugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/, 'Use 3–50 lower-case letters, digits or hyphens');

export const RoleSchema = z.enum(ROLE_ORDER);
export const PlanSchema = z.enum(PLANS);

/** POST /workspaces body. */
export const CreateWorkspaceInputSchema = z.object({
  name: WorkspaceNameSchema,
});

/** PATCH /workspaces/:workspaceId body: `name` and/or `slug`. */
export const UpdateWorkspaceInputSchema = z
  .object({
    name: WorkspaceNameSchema.optional(),
    slug: WorkspaceSlugSchema.optional(),
  })
  .refine((input) => input.name !== undefined || input.slug !== undefined, {
    error: 'Change at least one field',
  });

/** A workspace as the API returns it; `role` is the caller's role (UI only, docs/api/workspaces.md). */
export const WorkspaceDtoSchema = z.object({
  id: CuidSchema,
  name: z.string(),
  slug: WorkspaceSlugSchema,
  plan: PlanSchema,
  createdAt: z.iso.datetime(),
  role: RoleSchema,
});

/** PATCH /workspaces/:workspaceId/members/:userId body. */
export const ChangeMemberRoleInputSchema = z.object({
  role: RoleSchema,
});

/** A workspace member as the API returns it (docs/api/workspaces.md → MemberDto). */
export const MemberDtoSchema = z.object({
  user: UserDtoSchema.pick({ id: true, name: true, email: true, avatarUrl: true }),
  role: RoleSchema,
  joinedAt: z.iso.datetime(),
});

/** Invites never grant OWNER (I5); the API also caps the role at the caller's own. */
export const InviteRoleSchema = RoleSchema.exclude(['OWNER']);

/** POST /workspaces/:workspaceId/invites body. */
export const CreateInviteInputSchema = z.object({
  email: EmailSchema,
  role: InviteRoleSchema,
});

/** A pending invitation as the API returns it (docs/api/workspaces.md → InviteDto). */
export const InviteDtoSchema = z.object({
  id: CuidSchema,
  email: z.email(),
  role: InviteRoleSchema,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  invitedBy: UserDtoSchema.pick({ id: true, name: true }),
});

/** `data` of POST …/invites: the invite plus its link, which holds the raw token (shown once). */
export const CreatedInviteDtoSchema = InviteDtoSchema.extend({
  inviteUrl: z.url(),
});

/** POST /invites/accept body: the token from the invite link. */
export const AcceptInviteInputSchema = z.object({
  token: z.string().min(1).max(200),
});
