import type * as SentryModule from './sentry-sdk';
import type { Env } from '@/config/env';
import type { Breadcrumb, ErrorEvent } from '@sentry/react';

// Loaded only when a DSN is set, so the SDK stays out of the main bundle (ADR-024).
let sentry: Promise<typeof SentryModule> | undefined;

// An invite link carries its token in the path (/invite/:token), also URL-encoded inside
// ?redirectTo=. Sentry receives page URLs in events and breadcrumbs, so the token is replaced.
const INVITE_TOKEN = /(\/|%2F)invite(\/|%2F)[^/?#&%]+/gi;

export function redactUrl(url: string): string {
  return url.replace(INVITE_TOKEN, '$1invite$2[redacted]');
}

/** Keeps invite tokens and request headers (the Referer is a page URL) out of Sentry. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    event.request = { url: event.request.url && redactUrl(event.request.url) };
  }
  delete event.user;
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb);
  return event;
}

/** Navigation (from, to) and request (url) breadcrumbs carry URLs. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (!breadcrumb.data) return breadcrumb;
  const data = { ...breadcrumb.data };
  for (const key of ['url', 'from', 'to']) {
    if (typeof data[key] === 'string') data[key] = redactUrl(data[key]);
  }
  return { ...breadcrumb, data };
}

type ErrorTrackingEnv = Pick<
  Env,
  'VITE_SENTRY_DSN' | 'VITE_SENTRY_ENVIRONMENT' | 'VITE_VERCEL_GIT_COMMIT_SHA'
>;

/** Starts Sentry when VITE_SENTRY_DSN is set; otherwise every report is a no-op. */
export function initErrorTracking(env: ErrorTrackingEnv) {
  const dsn = env.VITE_SENTRY_DSN;
  if (!dsn) return;
  sentry = import('./sentry-sdk').then((Sentry) => {
    Sentry.init({
      dsn,
      environment: env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
      release: env.VITE_VERCEL_GIT_COMMIT_SHA,
      // Collect nothing about requests or users (Sentry v11 defaults to all); the scrubbers are the
      // second guard.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
      },
      beforeSend: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
    });
    return Sentry;
  });
}

/** Reports an error the app caught (an error boundary); uncaught ones Sentry sees itself. */
export function captureException(error: unknown) {
  void sentry?.then((Sentry) => Sentry.captureException(error));
}
