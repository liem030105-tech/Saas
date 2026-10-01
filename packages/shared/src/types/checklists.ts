import type {
  ChecklistDtoSchema,
  ChecklistItemDtoSchema,
  CreateChecklistInputSchema,
  CreateChecklistItemInputSchema,
  UpdateChecklistInputSchema,
  UpdateChecklistItemInputSchema,
} from '../schemas/checklists';
import type { z } from 'zod';

export type ChecklistDto = z.infer<typeof ChecklistDtoSchema>;
export type ChecklistItemDto = z.infer<typeof ChecklistItemDtoSchema>;
export type CreateChecklistInput = z.input<typeof CreateChecklistInputSchema>;
export type CreateChecklistData = z.output<typeof CreateChecklistInputSchema>;
export type UpdateChecklistInput = z.input<typeof UpdateChecklistInputSchema>;
export type UpdateChecklistData = z.output<typeof UpdateChecklistInputSchema>;
export type CreateChecklistItemInput = z.input<typeof CreateChecklistItemInputSchema>;
export type CreateChecklistItemData = z.output<typeof CreateChecklistItemInputSchema>;
export type UpdateChecklistItemInput = z.input<typeof UpdateChecklistItemInputSchema>;
export type UpdateChecklistItemData = z.output<typeof UpdateChecklistItemInputSchema>;
