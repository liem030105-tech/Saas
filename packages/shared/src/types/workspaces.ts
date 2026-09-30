import type { CreateWorkspaceInputSchema, WorkspaceDtoSchema } from '../schemas/workspaces';
import type { z } from 'zod';

/** What the create-workspace form holds (before trimming). */
export type CreateWorkspaceInput = z.input<typeof CreateWorkspaceInputSchema>;
export type CreateWorkspaceData = z.output<typeof CreateWorkspaceInputSchema>;
export type WorkspaceDto = z.infer<typeof WorkspaceDtoSchema>;
