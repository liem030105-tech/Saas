import * as Sentry from '@sentry/node';

import { env } from '../config/env';

import type { ErrorEvent, NodeOptions } from '@sentry/node';

/**
 * Keeps request details out of Sentry (security.md → Error handling and logging): headers carry the
 * access token and the refresh cookie, and bodies and query strings may hold passwords or invite
 * tokens. The request id links an event to the matching log line instead.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    const { method, url } = event.request;
    event.request = { method, url: url?.split('?')[0] };
  }
  delete event.user;
  return event;
}

/**
 * Starts Sentry when SENTRY_DSN is set (ADR-024); otherwise every report is a no-op. Tests pass a
 * DSN and a transport that keeps the events in memory.
 */
export function initErrorTracking(overrides: Pick<NodeOptions, 'dsn' | 'transport'> = {}) {
  const dsn = overrides.dsn ?? env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    transport: overrides.transport,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.RENDER_GIT_COMMIT,
    // Collect nothing about requests, users, queries or local variables (Sentry v11 defaults to all);
    // scrubEvent is the second guard.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    beforeSend: scrubEvent,
  });
}

/** Reports an unexpected (5xx) error with the id of the request that hit it. */
export function reportError(error: unknown, requestId: string) {
  Sentry.captureException(error, { tags: { requestId } });
}

/** Sends queued events before the process exits (waits at most two seconds). */
export async function flushErrorTracking() {
  await Sentry.close(2000);
}
