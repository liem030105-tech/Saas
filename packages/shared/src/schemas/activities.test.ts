import { describe, expect, it } from 'vitest';

import { ActivitiesPageSchema, ListActivitiesQuerySchema } from './activities';

const id = 'clx0000000000000000000001';

describe('ListActivitiesQuerySchema', () => {
  it('defaults the limit and takes an optional card', () => {
    expect(ListActivitiesQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(ListActivitiesQuerySchema.parse({ cardId: id, cursor: id, limit: '5' })).toEqual({
      cardId: id,
      cursor: id,
      limit: 5,
    });
  });

  it.each([{ cardId: 'not-a-cuid' }, { cursor: 'x' }, { limit: 101 }])('rejects %j', (query) => {
    expect(ListActivitiesQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('ActivitiesPageSchema', () => {
  const entry = {
    id,
    type: 'CARD_MOVED',
    data: { fromListId: id, toListId: id },
    createdAt: '2026-10-01T10:00:00.000Z',
    cardId: id,
    user: { id, name: 'Ada', avatarUrl: null },
  };

  it('accepts a page of entries, with or without a card', () => {
    const page = {
      data: [entry, { ...entry, type: 'LIST_CREATED', cardId: null }],
      nextCursor: null,
    };
    expect(ActivitiesPageSchema.parse(page)).toEqual(page);
  });

  it('rejects an unknown type', () => {
    const page = { data: [{ ...entry, type: 'CARD_TELEPORTED' }], nextCursor: null };
    expect(ActivitiesPageSchema.safeParse(page).success).toBe(false);
  });
});
