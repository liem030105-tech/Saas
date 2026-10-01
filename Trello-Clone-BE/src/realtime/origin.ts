import { AsyncLocalStorage } from 'node:async_hooks';

import type { NextFunction, Request, Response } from 'express';

// Which socket made the current request (REALTIME-001, docs/architecture/realtime.md → Own
// changes): the client sends its socket id in `X-Socket-Id`, and emitters leave that one socket
// out. Its tab already shows the change; the user's other tabs and browsers still hear it.

const SOCKET_ID = /^[A-Za-z0-9_-]{1,64}$/;
const origin = new AsyncLocalStorage<{ socketId: string }>();

/** Express middleware: remembers a well-formed `X-Socket-Id` for the rest of the request. */
export function realtimeOrigin(req: Request, _res: Response, next: NextFunction) {
  const socketId = req.get('x-socket-id');
  if (socketId && SOCKET_ID.test(socketId)) origin.run({ socketId }, next);
  else next();
}

/** The socket that made the current request, if it said so. */
export const originSocketId = () => origin.getStore()?.socketId;
