import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler } from './middlewares/error-handler';
import { notFound } from './middlewares/not-found';
import { requestId } from './middlewares/request-id';
import { authRouter } from './modules/auth/auth.routes';
import { billingRouter } from './modules/billing/billing.routes';
import { boardsRouter } from './modules/boards/boards.routes';
import { cardsRouter } from './modules/cards/cards.routes';
import { commentsRouter } from './modules/comments/comments.routes';
import { healthRouter } from './modules/health/health.routes';
import { listsRouter } from './modules/lists/lists.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { usersRouter } from './modules/users/users.routes';
import { invitesRouter } from './modules/workspaces/invites.routes';
import { workspacesRouter } from './modules/workspaces/workspaces.routes';
import { realtimeOrigin } from './realtime/origin';

export const API_PREFIX = '/api/v1';

interface CreateAppOptions {
  /** Extra routes under /api/v1, mounted before the 404 handler. Used by tests only. */
  extraRoutes?: Router;
}

/** Builds the Express app without listening, so tests can drive it with Supertest. */
export function createApp({ extraRoutes }: CreateAppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');

  // Order matters (FOUNDATION-002): the request id comes first so every log line and error has it.
  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => req.id }));
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(realtimeOrigin); // which socket made the request, for realtime emits (REALTIME-001)

  const api = Router();
  api.use(healthRouter);
  api.use(authRouter);
  api.use(usersRouter);
  api.use(invitesRouter);
  api.use(workspacesRouter);
  api.use(boardsRouter);
  api.use(listsRouter);
  api.use(cardsRouter);
  api.use(commentsRouter);
  api.use(notificationsRouter);
  api.use(billingRouter);
  if (extraRoutes) api.use(extraRoutes);
  app.use(API_PREFIX, api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
