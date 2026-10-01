import { describe, expect, it } from 'vitest';

import { CommentInputSchema, ListCommentsQuerySchema } from './comments';

describe('CommentInputSchema', () => {
  it('trims the content and keeps markdown as written', () => {
    expect(CommentInputSchema.parse({ content: '  **Done** \n' })).toEqual({ content: '**Done**' });
  });

  it.each([{}, { content: '   ' }, { content: 'c'.repeat(5001) }])('rejects %j', (input) => {
    expect(CommentInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('ListCommentsQuerySchema', () => {
  it('defaults the page size and reads numbers from the query string', () => {
    expect(ListCommentsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(ListCommentsQuerySchema.parse({ limit: '5' })).toEqual({ limit: 5 });
  });

  it.each([{ limit: '0' }, { limit: '101' }, { cursor: 'not-a-cuid' }])('rejects %j', (query) => {
    expect(ListCommentsQuerySchema.safeParse(query).success).toBe(false);
  });
});
