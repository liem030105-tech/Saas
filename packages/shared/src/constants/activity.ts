// Activity log event types (docs/database/schema.md → ActivityType), same values as the Prisma
// enum. Later tasks append theirs (LIST_CREATED, CARD_MOVED, …).
export const ACTIVITY_TYPES = [
  'BOARD_CREATED',
  'BOARD_UPDATED',
  'LIST_CREATED',
  'LIST_UPDATED',
  'LIST_ARCHIVED',
  'LIST_MOVED',
  'CARD_CREATED',
  'CARD_UPDATED',
  'CARD_ARCHIVED',
  'CARD_MOVED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'COMMENT_ADDED',
  'LABEL_ADDED',
  'LABEL_REMOVED',
  'CHECKLIST_ADDED',
  'CHECKLIST_REMOVED',
  'CHECKLIST_ITEM_CHECKED',
  'ATTACHMENT_ADDED',
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];
