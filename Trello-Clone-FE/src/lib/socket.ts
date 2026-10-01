import { io } from 'socket.io-client';

import { refreshAccessToken } from '@/api/client';
import { setSocketId } from '@/api/socket-id';
import { getAccessToken } from '@/api/token-store';
import { env } from '@/config/env';

import type { RealtimeEvent, RealtimeEventType, RoomAck, RoomRequest } from '@trello-clone/shared';

// The realtime connection (docs/architecture/realtime.md → Connection and authorization; FE
// synchronization rules). One socket for the app, opened when a page first needs it. It only
// joins rooms and listens: every change goes through REST. Feature hooks (useBoardSocket, …) use
// `joinRoom`, `onEvent` and `onReconnect`; nothing else touches the socket.

/** The part of a Socket.IO client this module uses (tests pass an in-memory one). */
export interface RealtimeTransport {
  readonly connected: boolean;
  /** Set while connected; REST requests send it as `X-Socket-Id`. */
  readonly id?: string;
  on(event: string, listener: (...args: never[]) => void): unknown;
  off(event: string, listener: (...args: never[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
  connect(): unknown;
  disconnect(): unknown;
}

type Factory = (auth: (cb: (data: { token: string | null }) => void) => void) => RealtimeTransport;

const socketIoFactory: Factory = (auth) =>
  io(env.VITE_SOCKET_URL, { auth, transports: ['websocket'] }) as unknown as RealtimeTransport;

let factory: Factory = socketIoFactory;
let socket: RealtimeTransport | null = null;
let connectedBefore = false;
/** Rooms to be in: joined again on every reconnect. Keyed by message and id. */
const rooms = new Map<string, { event: keyof RoomRequest; payload: object; count: number }>();
const reconnectListeners = new Set<() => void>();

/** Tests replace the Socket.IO client with an in-memory transport (and back with `null`). */
export function setRealtimeTransportFactory(next: Factory | null) {
  closeRealtime();
  factory = next ?? socketIoFactory;
}

function realtime(): RealtimeTransport {
  if (socket) return socket;
  // The token is read on every (re)connect, so a refreshed token is used from the next one on.
  const created = factory((cb) => cb({ token: getAccessToken() }));
  created.on('connect', () => {
    setSocketId(created.id ?? null);
    for (const { event, payload } of rooms.values()) created.emit(event, payload);
    if (connectedBefore) for (const listener of reconnectListeners) listener();
    connectedBefore = true;
  });
  created.on('disconnect', () => setSocketId(null));
  // A refused handshake (expired token) is not retried by Socket.IO: refresh, then reconnect.
  created.on('connect_error', (error: Error) => {
    if (error.message !== 'UNAUTHORIZED' || getAccessToken() === null) return;
    refreshAccessToken().then(
      () => {
        if (socket === created) created.connect();
      },
      () => {}, // the session ended; the app signs out on the next request
    );
  });
  socket = created;
  return created;
}

/**
 * Joins `board:{id}` or `workspace:{id}` while the returned function has not been called; joined
 * again after every reconnect. Several callers may hold the same room.
 */
export function joinRoom<E extends 'board:join' | 'workspace:join'>(
  event: E,
  payload: RoomRequest[E],
  onRefused?: (ack: RoomAck) => void,
): () => void {
  const key = `${event}:${JSON.stringify(payload)}`;
  const held = rooms.get(key);
  const current = realtime();
  if (held) held.count += 1;
  else {
    rooms.set(key, { event, payload, count: 1 });
    if (current.connected) {
      current.emit(event, payload, (ack: RoomAck) => {
        if (!ack.ok) onRefused?.(ack);
      });
    }
  }
  return () => {
    const room = rooms.get(key);
    if (!room) return;
    room.count -= 1;
    if (room.count > 0) return;
    rooms.delete(key);
    socket?.emit(event === 'board:join' ? 'board:leave' : 'workspace:leave', payload);
  };
}

/** Calls `listener` with each `type` event the socket hears; returns the unsubscribe. */
export function onEvent<T extends RealtimeEventType>(
  type: T,
  listener: (event: RealtimeEvent<T>) => void,
): () => void {
  const current = realtime();
  const handler = listener as (...args: never[]) => void;
  current.on(type, handler);
  return () => current.off(type, handler);
}

/** Calls `listener` after every reconnect (not the first connect): events may have been missed. */
export function onReconnect(listener: () => void): () => void {
  realtime();
  reconnectListeners.add(listener);
  return () => reconnectListeners.delete(listener);
}

/** Closes the connection and forgets its rooms (sign-out, tests). */
export function closeRealtime() {
  socket?.disconnect();
  setSocketId(null);
  socket = null;
  connectedBefore = false;
  rooms.clear();
  reconnectListeners.clear();
}

/**
 * Remembers the last `size` event ids, so an event delivered twice (two rooms, a reconnect) is
 * applied once.
 */
export function createEventDedupe(size = 200) {
  const seen = new Set<string>();
  return (eventId: string) => {
    if (seen.has(eventId)) return false;
    seen.add(eventId);
    if (seen.size > size) seen.delete(seen.values().next().value!);
    return true;
  };
}
