// In-app notification types (NOTIFICATIONS-001, docs/api/notifications.md → Triggers, ADR-021).
export const NOTIFICATION_TYPES = [
  'CARD_ASSIGNED',
  'CARD_COMMENTED',
  'CARD_MENTIONED',
  'CARD_DUE_SOON',
  'WORKSPACE_INVITED',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** `comment.excerpt`: the comment's first characters, raw markdown. */
export const NOTIFICATION_EXCERPT_LENGTH = 140;
