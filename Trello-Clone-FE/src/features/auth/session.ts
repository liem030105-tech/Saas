import { toast } from 'sonner';

import { isSessionOver, onSessionEnded, refreshAccessToken } from '@/api/client';
import { getAccessToken } from '@/api/token-store';

import type { QueryClient } from '@tanstack/react-query';
import type { createBrowserRouter } from 'react-router';

type Router = Pick<ReturnType<typeof createBrowserRouter>, 'navigate' | 'state'>;

export const LOGIN_PATH = '/login';

/** One toast id, so several failing requests show one message. */
const SESSION_TOAST_ID = 'session-ended';
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Log in again.';

/**
 * Restores the session on app start (docs/architecture/security.md → Frontend token handling):
 * one /auth/refresh with the HttpOnly cookie. A 401 means "signed out". Any other failure (API
 * down, network error) is thrown, so the route's error page offers a reload instead of showing a
 * signed-in user as signed out. Used as the root route's loader: pages render after it settles.
 */
export async function restoreSession(): Promise<null> {
  if (getAccessToken()) return null;
  try {
    await refreshAccessToken();
  } catch (error) {
    if (!isSessionOver(error)) throw error;
  }
  return null;
}

/** `/login?redirectTo=<where the user was>`, so signing in again returns there. */
export function loginPathFor({ pathname, search, hash }: Router['state']['location']) {
  if (pathname === LOGIN_PATH) return LOGIN_PATH;
  const redirectTo = encodeURIComponent(`${pathname}${search}${hash}`);
  return `${LOGIN_PATH}?redirectTo=${redirectTo}`;
}

/**
 * When a request's session cannot be refreshed (expired, or a replayed token): drop cached server data (the next user of this
 * browser must not see it), tell the user, and go to the login page. Returns an unsubscribe.
 */
export function handleSessionEnd(router: Router, queryClient: QueryClient) {
  return onSessionEnded(() => {
    queryClient.clear();
    toast.error(SESSION_EXPIRED_MESSAGE, { id: SESSION_TOAST_ID });
    void router.navigate(loginPathFor(router.state.location), { replace: true });
  });
}
