import { z } from 'zod';

import { ERROR_CODES } from '../constants/error-codes';
import { PAGINATION } from '../constants/pagination';

/** Every `…Id` param and body field (docs/api/README.md → Validation rules). */
export const CuidSchema = z.cuid();

/** A client-supplied ordering position (docs/api/README.md → Validation rules): finite and > 0. */
export const PositionSchema = z
  .number({ error: 'Position must be a number' })
  .refine(Number.isFinite, 'Position must be a finite number')
  .gt(0, 'Position must be greater than 0');

/** `?limit=<n>&cursor=<id>` on paginated endpoints. Query strings arrive as text, hence coerce. */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGINATION.maxLimit).default(PAGINATION.defaultLimit),
  cursor: CuidSchema.optional(),
});

export const ErrorCodeSchema = z.enum(ERROR_CODES);

/** One entry of `error.details`; validation errors name the failing field `path`. */
export const ErrorDetailSchema = z.looseObject({
  path: z.string().optional(),
  message: z.string(),
});

/** The canonical error body every non-2xx response carries. */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.array(ErrorDetailSchema),
    requestId: z.string(),
  }),
});
