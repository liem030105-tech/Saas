import { setRealtimeTransportFactory, type RealtimeTransport } from '@/lib/socket';

import type { RealtimeEvent, RealtimeEventType, RoomAck } from '@trello-clone/shared';

// An in-memory stand-in for the Socket.IO connection (lib/socket.ts): tests see what the app sent
// (room joins and leaves) and push server events to it, without a server. Installed for every
// test by tests/setup.ts; `realtime()` returns the current one.

type Listener = (...args: never[]) => void;

export class FakeRealtime implements RealtimeTransport {
  connected = false;
  id?: string;
  private connections = 0;
  /** Room messages the app sent, in order: `board:join {"boardId":…}`. */
  readonly sent: string[] = [];
  /** What a join answers (the server's ack). */
  ack: RoomAck = { ok: true };
  private readonly listeners = new Map<string, Set<Listener>>();
  private eventIds = 0;

  constructor() {
    // Connects on the next tick, like the real client.
    queueMicrotask(() => this.connect());
  }

  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, payload: unknown, ack?: (answer: RoomAck) => void) {
    this.sent.push(`${event} ${JSON.stringify(payload)}`);
    ack?.(this.ack);
    return this;
  }

  connect() {
    if (this.connected) return this;
    this.connected = true;
    this.connections += 1;
    this.id = `fake-socket-${this.connections}`;
    this.fire('connect');
    return this;
  }

  disconnect() {
    this.connected = false;
    this.id = undefined;
    this.fire('disconnect');
    return this;
  }

  /** Drops the connection and connects again (Socket.IO's automatic reconnect). */
  reconnect() {
    this.disconnect();
    this.connect();
  }

  /** The server refuses the handshake (`connect_error`), e.g. `UNAUTHORIZED` for an expired token. */
  refuseHandshake(message: string) {
    this.connected = false;
    this.fire('connect_error', new Error(message));
  }

  /** The server sends `type`; `event` fills the envelope (a fresh `eventId` unless given). */
  serverSends<T extends RealtimeEventType>(
    type: T,
    event: Omit<RealtimeEvent<T>, 'type' | 'eventId'> & { eventId?: string },
  ) {
    this.eventIds += 1;
    this.fire(type, { eventId: `event-${this.eventIds}`, ...event, type });
  }

  private fire(event: string, ...args: unknown[]) {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      (listener as (...a: unknown[]) => void)(...args);
    }
  }
}

let current: FakeRealtime | null = null;

/** Installs a fresh fake connection factory (each new connection replaces `realtime()`). */
export function installFakeRealtime() {
  current = null;
  setRealtimeTransportFactory(() => {
    current = new FakeRealtime();
    return current;
  });
}

/** The fake connection the app opened in this test. */
export function realtime(): FakeRealtime {
  if (!current) throw new Error('The app has not opened a realtime connection');
  return current;
}
