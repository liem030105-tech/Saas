import { z } from 'zod';

import { ChecklistDtoSchema } from './checklists';
import { CuidSchema, PositionSchema } from './common';
import { LabelDtoSchema } from './labels';

// Field rules: docs/api/README.md → Validation rules. Messages are shown in the UI (English).

export const CardTitleSchema = z
  .string({ error: 'Enter a card title' })
  .trim()
  .min(1, 'Enter a card title')
  .max(200, 'Title must be at most 200 characters');

/** POST /lists/:listId/cards body; without `position` the card is appended at the end. */
export const CreateCardInputSchema = z.object({
  title: CardTitleSchema,
  position: PositionSchema.optional(),
});

/**
 * A card as it appears on a board (docs/api/boards.md → CardSummaryDto). Fields owned by CARD-005
 * (labels, members, checklist, comments, cover) are empty or zero until that task lands.
 */
export const CardSummaryDtoSchema = z.object({
  id: CuidSchema,
  listId: CuidSchema,
  title: z.string(),
  position: z.number(),
  dueDate: z.iso.datetime().nullable(),
  completed: z.boolean(),
  coverUrl: z.url().nullable(),
  labelIds: z.array(CuidSchema),
  memberIds: z.array(CuidSchema),
  checklist: z.object({ done: z.number().int(), total: z.number().int() }),
  commentCount: z.number().int(),
});

/** Card description: raw markdown, at most 10 000 chars; `null` clears it. */
export const CardDescriptionSchema = z
  .string({ error: 'Enter a description' })
  .max(10_000, 'Description must be at most 10 000 characters')
  .nullable();

/** `dueDate`: an ISO 8601 datetime (UTC offset allowed) or `null` to clear it. */
export const DueDateSchema = z.iso
  .datetime({ offset: true, error: 'Use an ISO 8601 date and time' })
  .nullable();

/** PATCH /cards/:cardId body (at least one field). */
export const UpdateCardInputSchema = z
  .object({
    title: CardTitleSchema.optional(),
    description: CardDescriptionSchema.optional(),
    dueDate: DueDateSchema.optional(),
    completed: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    error: 'Change at least one field',
  });

/** A user as cards show them (docs/api/cards.md → UserSummary). */
export const UserSummarySchema = z.object({
  id: CuidSchema,
  name: z.string(),
  avatarUrl: z.url().nullable(),
});

/** docs/api/cards.md → AttachmentDto (ATTACHMENTS-001). */
export const AttachmentDtoSchema = z.object({
  id: CuidSchema,
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  url: z.url(),
  createdAt: z.iso.datetime(),
  uploader: UserSummarySchema,
});

/**
 * GET /cards/:cardId (docs/api/cards.md → CardDetailDto). Members, labels and checklists arrive
 * with CARD-005 and attachments with ATTACHMENTS-001; until then those arrays are empty.
 */
export const CardDetailDtoSchema = CardSummaryDtoSchema.extend({
  boardId: CuidSchema,
  description: z.string().nullable(),
  archived: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  members: z.array(UserSummarySchema),
  labels: z.array(LabelDtoSchema),
  checklists: z.array(ChecklistDtoSchema),
  attachments: z.array(AttachmentDtoSchema),
});

/** PATCH /cards/:cardId/move body: the target list (may be the current one) and the position there. */
export const MoveCardInputSchema = z.object({
  listId: CuidSchema,
  position: PositionSchema,
});

/** PATCH /cards/:cardId/move answer, with the final stored position (after any rebalance). */
export const MoveCardResultSchema = z.object({
  id: CuidSchema,
  listId: CuidSchema,
  boardId: CuidSchema,
  position: z.number(),
  updatedAt: z.iso.datetime(),
});
