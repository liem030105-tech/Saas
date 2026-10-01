import type { CreateLabelInputSchema, UpdateLabelInputSchema } from '../schemas/labels';
import type { z } from 'zod';

export type CreateLabelInput = z.input<typeof CreateLabelInputSchema>;
export type CreateLabelData = z.output<typeof CreateLabelInputSchema>;
export type UpdateLabelInput = z.input<typeof UpdateLabelInputSchema>;
export type UpdateLabelData = z.output<typeof UpdateLabelInputSchema>;
