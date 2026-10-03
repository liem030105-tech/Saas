import { describe, expect, it } from 'vitest';

import {
  ListNotificationsQuerySchema,
  NotificationDtoSchema,
  UpdateNotificationInputSchema,
} from './notifications';

// docs/api/notifications.md (NOTIFICATIONS-001).

const id = 'clx0000000000000000000001';

describe('ListNotificationsQuerySchema', () => {
  it('defaults to every notification, 20 per page', () => {
    expect(ListNotificationsQuerySchema.parse({})).toEqual({ limit: 20, unread: false });
  });

  it('reads unread=true and a cursor from the query string', () => {
    expect(ListNotificationsQuerySchema.parse({ unread: 'true', cursor: id, limit: '5' })).toEqual({
      unread: true,
      cursor: id,
      limit: 5,
    });
  });

  it.each([{ unread: 'yes' }, { limit: '0' }, { cursor: 'nope' }])('rejects %j', (query) => {
    expect(ListNotificationsQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('UpdateNotificationInputSchema', () => {
  it('takes a boolean only', () => {
    expect(UpdateNotificationInputSchema.parse({ read: true })).toEqual({ read: true });
    expect(UpdateNotificationInputSchema.safeParse({ read: 'true' }).success).toBe(false);
  });
});

describe('NotificationDtoSchema', () => {
  it('accepts an invite notification without a board or card', () => {
    const dto = {
      id,
      type: 'WORKSPACE_INVITED',
      read: false,
      createdAt: '2026-10-03T00:00:00.000Z',
      actor: { id, name: 'Ada', avatarUrl: null },
      workspace: { id, name: 'Acme', slug: 'acme' },
      board: null,
      card: null,
      comment: null,
      invite: { id, role: 'MEMBER' },
    };
    expect(NotificationDtoSchema.parse(dto)).toEqual(dto);
    // Invites never grant OWNER (I5).
    expect(NotificationDtoSchema.safeParse({ ...dto, invite: { id, role: 'OWNER' } }).success).toBe(
      false,
    );
  });
});
