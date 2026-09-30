// Activity log event types (docs/database/schema.md → ActivityType), same values as the Prisma
// enum. Later tasks append theirs (LIST_CREATED, CARD_MOVED, …).
export const ACTIVITY_TYPES = ['BOARD_CREATED', 'BOARD_UPDATED', 'LIST_CREATED'] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];
