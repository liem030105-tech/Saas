import type {
  AcceptInviteInputSchema,
  ChangeMemberRoleInputSchema,
  CreatedInviteDtoSchema,
  CreateInviteInputSchema,
  InviteDtoSchema,
  CreateWorkspaceInputSchema,
  MemberDtoSchema,
  UpdateWorkspaceInputSchema,
  WorkspaceDtoSchema,
} from '../schemas/workspaces';
import type { z } from 'zod';

/** What the create-workspace form holds (before trimming). */
export type CreateWorkspaceInput = z.input<typeof CreateWorkspaceInputSchema>;
export type CreateWorkspaceData = z.output<typeof CreateWorkspaceInputSchema>;
/** What the workspace settings form sends (before trimming). */
export type UpdateWorkspaceInput = z.input<typeof UpdateWorkspaceInputSchema>;
export type UpdateWorkspaceData = z.output<typeof UpdateWorkspaceInputSchema>;
export type WorkspaceDto = z.infer<typeof WorkspaceDtoSchema>;
export type ChangeMemberRoleInput = z.infer<typeof ChangeMemberRoleInputSchema>;
export type MemberDto = z.infer<typeof MemberDtoSchema>;
/** What the invite form holds (before trimming and lower-casing the email). */
export type CreateInviteInput = z.input<typeof CreateInviteInputSchema>;
export type CreateInviteData = z.output<typeof CreateInviteInputSchema>;
export type InviteDto = z.infer<typeof InviteDtoSchema>;
export type CreatedInviteDto = z.infer<typeof CreatedInviteDtoSchema>;
export type AcceptInviteInput = z.infer<typeof AcceptInviteInputSchema>;
