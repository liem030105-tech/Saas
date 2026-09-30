import type { ListDtoSchema } from '../schemas/lists';
import type { z } from 'zod';

export type ListDto = z.infer<typeof ListDtoSchema>;
