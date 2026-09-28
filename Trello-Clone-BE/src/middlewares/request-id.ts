import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// A caller-supplied id is reused only when it is short and log-safe.
const SAFE_REQUEST_ID = /^[\w.-]{1,128}$/;

/** First middleware: every response, including errors, carries X-Request-Id. */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get(REQUEST_ID_HEADER);
  const id = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.locals.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
