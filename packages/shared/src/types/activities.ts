import type {
  ActivitiesPageSchema,
  ActivityDtoSchema,
  ListActivitiesQuerySchema,
} from '../schemas/activities';
import type { z } from 'zod';

export type ActivityDto = z.infer<typeof ActivityDtoSchema>;
export type ListActivitiesQuery = z.output<typeof ListActivitiesQuerySchema>;
export type ActivitiesPage = z.infer<typeof ActivitiesPageSchema>;
