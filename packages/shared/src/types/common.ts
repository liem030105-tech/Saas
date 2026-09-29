import type {
  ErrorDetailSchema,
  ErrorResponseSchema,
  PaginationQuerySchema,
} from '../schemas/common';
import type { z } from 'zod';

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
