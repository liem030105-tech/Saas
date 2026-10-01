import { describe, expect, expectTypeOf, it } from 'vitest';

import { REALTIME_EVENTS, ROOM_EVENTS } from './events';

import type { RealtimeEventData } from '../types/realtime';

describe('realtime event names', () => {
  it('are <domain>:<past-tense-verb> and unique (D-16)', () => {
    for (const name of REALTIME_EVENTS) expect(name).toMatch(/^[a-z]+:[a-z]+ed$/);
    expect(new Set(REALTIME_EVENTS).size).toBe(REALTIME_EVENTS.length);
  });

  it('every event has exactly one data type', () => {
    expectTypeOf<keyof RealtimeEventData>().toEqualTypeOf<(typeof REALTIME_EVENTS)[number]>();
  });

  it('room messages', () => {
    expect(Object.values(ROOM_EVENTS)).toEqual([
      'board:join',
      'board:leave',
      'workspace:join',
      'workspace:leave',
    ]);
  });
});
