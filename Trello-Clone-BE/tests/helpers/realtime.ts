import { createServer } from 'node:http';

import { io as connect, type Socket as ClientSocket } from 'socket.io-client';

import { attachRealtime, closeRealtime } from '../../src/realtime/socket';

import type { RoomAck } from '@trello-clone/shared';
import type { Express } from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'socket.io';

// Realtime test harness (REALTIME-001): the app and Socket.IO on one HTTP server on a free port,
// and socket.io-client connections to it.

export interface RealtimeHarness {
  url: string;
  io: Server;
  close: () => Promise<void>;
}

export async function startRealtime(app: Express): Promise<RealtimeHarness> {
  const http = createServer(app);
  const io = attachRealtime(http);
  await new Promise<void>((resolve) => http.listen(0, resolve));
  const { port } = http.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    io,
    // Closing Socket.IO also closes the HTTP server.
    close: closeRealtime,
  };
}

/** A client socket; `auth` is sent as the handshake auth (`{ token }` normally). */
export function clientFor(url: string, auth: Record<string, unknown>): ClientSocket {
  return connect(url, { auth, transports: ['websocket'], reconnection: false, forceNew: true });
}

/** Resolves once connected, or rejects with the server's refusal (`connect_error`). */
export function connected(socket: ClientSocket): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

/** Emits a room message and resolves with the server's ack. */
export function roomRequest(socket: ClientSocket, event: string, payload: unknown) {
  return socket.timeout(5000).emitWithAck(event, payload) as Promise<RoomAck>;
}
