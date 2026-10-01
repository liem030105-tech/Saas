import { randomUUID } from 'node:crypto';

import { originSocketId } from '../origin';
import { realtimeServer } from '../socket';

import type { RealtimeEvent, RealtimeEventType } from '@trello-clone/shared';

// The only place that sends domain events (docs/architecture/realtime.md → Principles). Services
// call the `<domain>.events.ts` functions after their transaction commits; never `io` directly.

/**
 * Sends `event` (with a fresh `eventId`) to everyone in `rooms`, each socket once, except the
 * socket that made the request (it already shows the change; realtime/origin.ts).
 */
export function emitEvent<T extends RealtimeEventType>(
  rooms: string[],
  event: Omit<RealtimeEvent<T>, 'eventId'>,
) {
  const server = realtimeServer();
  if (!server) return;
  const origin = originSocketId();
  const target = origin ? server.to(rooms).except(origin) : server.to(rooms);
  target.emit(event.type, { eventId: randomUUID(), ...event } satisfies RealtimeEvent<T>);
}

/** `version` of a write: the record's `updatedAt`; a delete or a rebalance has none: now. */
export const versionOf = (record?: { updatedAt: Date }) =>
  record ? record.updatedAt.getTime() : Date.now();
