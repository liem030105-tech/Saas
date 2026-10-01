import type {
  BoardDetailDtoSchema,
  BoardDtoSchema,
  UpdateBoardInputSchema,
  CreateBoardInputSchema,
  ListBoardsQuerySchema,
} from '../schemas/boards';
import type { LabelDtoSchema } from '../schemas/labels';
import type { z } from 'zod';

/** What the create-board form holds (before trimming). */
export type CreateBoardInput = z.input<typeof CreateBoardInputSchema>;
export type CreateBoardData = z.output<typeof CreateBoardInputSchema>;
export type ListBoardsQuery = z.output<typeof ListBoardsQuerySchema>;
export type BoardDto = z.infer<typeof BoardDtoSchema>;
export type UpdateBoardInput = z.input<typeof UpdateBoardInputSchema>;
export type UpdateBoardData = z.output<typeof UpdateBoardInputSchema>;
export type LabelDto = z.infer<typeof LabelDtoSchema>;
export type BoardDetailDto = z.infer<typeof BoardDetailDtoSchema>;
