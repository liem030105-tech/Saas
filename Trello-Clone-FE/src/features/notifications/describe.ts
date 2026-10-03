import type { NotificationDto } from '@trello-clone/shared';

// What a notification says (docs/api/notifications.md → Frontend), like the activity feed.

const ROLE_NAMES = { ADMIN: 'an Admin', MEMBER: 'a Member', VIEWER: 'a Viewer' } as const;

/** "Ada assigned you to Fix login", "Fix login is due soon", … (an account gone reads "Someone"). */
export function describeNotification(notification: NotificationDto): string {
  const actor = notification.actor?.name ?? 'Someone';
  const card = notification.card?.title ?? 'a card';
  switch (notification.type) {
    case 'CARD_ASSIGNED':
      return `${actor} assigned you to ${card}`;
    case 'CARD_COMMENTED':
      return `${actor} commented on ${card}`;
    case 'CARD_MENTIONED':
      return `${actor} mentioned you on ${card}`;
    case 'CARD_DUE_SOON':
      return `${card} is due soon`;
    case 'WORKSPACE_INVITED':
      return `${actor} invited you to ${notification.workspace.name} as ${
        notification.invite ? ROLE_NAMES[notification.invite.role] : 'a member'
      }`;
  }
}

/** A comment excerpt as people read it: mentions (D-28) as "@Name", not as their markdown. */
export const excerptText = (excerpt: string) =>
  excerpt.replace(/@\[([^\]]*)\]\(mention:[a-z0-9]+\)/g, '@$1');
