import { roadmapBoard } from './boards';
import { loginCard } from './cards';
import { acmeWorkspace, betaWorkspace, ownerMember } from './workspaces';

import type { NotificationDto } from '@trello-clone/shared';

// Notification test data (NOTIFICATIONS-001).

const workspace = (w: typeof acmeWorkspace) => ({ id: w.id, name: w.name, slug: w.slug });
const board = { id: roadmapBoard.id, title: roadmapBoard.title };
const card = { id: loginCard.id, title: loginCard.title, dueDate: null };

/** Ada (the workspace's owner) assigned the signed-in user to Fix login; unread. */
export const assignedNotification: NotificationDto = {
  id: 'clx00000000000000000000b1',
  type: 'CARD_ASSIGNED',
  read: false,
  createdAt: '2026-10-03T09:00:00.000Z',
  actor: {
    id: ownerMember.user.id,
    name: ownerMember.user.name,
    avatarUrl: ownerMember.user.avatarUrl,
  },
  workspace: workspace(acmeWorkspace),
  board,
  card,
  comment: null,
  invite: null,
};

/** A comment on Fix login; already read. */
export const commentedNotification: NotificationDto = {
  ...assignedNotification,
  id: 'clx00000000000000000000b2',
  type: 'CARD_COMMENTED',
  read: true,
  createdAt: '2026-10-03T08:00:00.000Z',
  comment: { id: 'clx00000000000000000000c1', excerpt: 'Steps to reproduce: open the page' },
};

/** Fix login is due within 24 hours; unread, no actor. */
export const dueSoonNotification: NotificationDto = {
  ...assignedNotification,
  id: 'clx00000000000000000000b3',
  type: 'CARD_DUE_SOON',
  createdAt: '2026-10-03T07:00:00.000Z',
  actor: null,
};

/** An invite to Beta Squad; unread. */
export const invitedNotification: NotificationDto = {
  ...assignedNotification,
  id: 'clx00000000000000000000b4',
  type: 'WORKSPACE_INVITED',
  createdAt: '2026-10-03T06:00:00.000Z',
  workspace: workspace(betaWorkspace),
  board: null,
  card: null,
  invite: { id: 'clx00000000000000000000d1', role: 'MEMBER' },
};

export const notificationTexts = {
  assigned: `${ownerMember.user.name} assigned you to ${loginCard.title}`,
  commented: `${ownerMember.user.name} commented on ${loginCard.title}`,
  dueSoon: `${loginCard.title} is due soon`,
  invited: `${ownerMember.user.name} invited you to ${betaWorkspace.name} as a Member`,
};
