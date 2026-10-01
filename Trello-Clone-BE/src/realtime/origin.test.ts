import { describe, expect, it } from 'vitest';

import { originSocketId, realtimeOrigin } from './origin';

import type { Request, Response } from 'express';

// The X-Socket-Id middleware (REALTIME-001): which socket made the request, for emitEvent's
// `.except()`. The end-to-end exclusion is in tests/integration/realtime-events.test.ts.

/** Runs the middleware with `header` and returns what the rest of the request would see. */
function originFor(header: string | undefined) {
  const req = { get: (name: string) => (name === 'x-socket-id' ? header : undefined) };
  let seen: string | undefined = 'next() not called';
  realtimeOrigin(req as Request, {} as Response, () => {
    seen = originSocketId();
  });
  return seen;
}

describe('realtimeOrigin', () => {
  it('keeps a well-formed socket id for the rest of the request, and only there', () => {
    expect(originFor('Ab_9-xYz')).toBe('Ab_9-xYz');
    expect(originSocketId()).toBeUndefined();
  });

  it('ignores a missing, malformed or too long id', () => {
    for (const header of [undefined, '', 'not valid!', 'a/b', 'x'.repeat(65)]) {
      expect(originFor(header)).toBeUndefined();
    }
  });
});
