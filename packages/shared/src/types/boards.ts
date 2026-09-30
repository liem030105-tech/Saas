import type {
  BoardDtoSchema,
  CreateBoardInputSchema,
  ListBoardsQuerySchema,
} from '../schemas/boards';
import type { z } from 'zod';

/** What the create-board form holds (before trimming). */
export type CreateBoardInput = z.input<typeof CreateBoardInputSchema>;
export type CreateBoardData = z.output<typeof CreateBoardInputSchema>;
export type ListBoardsQuery = z.output<typeof ListBoardsQuerySchema>;
export type BoardDto = z.infer<typeof BoardDtoSchema>;
