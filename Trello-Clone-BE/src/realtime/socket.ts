import { Server } from 'socket.io';

import { registerRooms } from './rooms';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { verifyAccessToken } from '../modules/auth/tokens';

import type { Server as HttpServer } from 'node:http';

// docs/architecture/realtime.md → Connection and authorization (ADR-009). One API instance with
// the in-memory adapter; a Redis adapter would be added here only, without touching emitters.

let io: Server | undefined;

/**
 * Attaches Socket.IO to the API's HTTP server, on the API origin at `/socket.io`. A handshake
 * without a valid access token (`auth: { token }`) is refused with `UNAUTHORIZED`; an open socket
 * is not re-checked (the FE reconnects with a fresh token after a refresh).
 */
export function attachRealtime(httpServer: HttpServer): Server {
  const server = new Server(httpServer, {
    cors: { origin: env.CLIENT_URL, credentials: true },
  });
  server.use((socket, next) => {
    const { token } = socket.handshake.auth as { token?: unknown };
    if (typeof token !== 'string') return next(new Error('UNAUTHORIZED'));
    verifyAccessToken(token).then(
      (userId) => {
        socket.data.userId = userId;
        next();
      },
      () => next(new Error('UNAUTHORIZED')),
    );
  });
  server.on('connection', (socket) => {
    registerRooms(socket);
    socket.on('error', (error) => logger.warn({ err: error }, 'Socket error'));
  });
  io = server;
  return server;
}

/** The running server, for emitters (realtime/events/*); undefined until attached. */
export function realtimeServer(): Server | undefined {
  return io;
}

/** Closes every socket (tests and shutdown). */
export async function closeRealtime(): Promise<void> {
  const server = io;
  io = undefined;
  await server?.close();
}
