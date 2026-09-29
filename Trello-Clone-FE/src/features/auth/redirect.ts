const BASE = 'https://app.invalid';

const isProtocolRelative = (path: string) => /^\/[/\\]/.test(path);

/**
 * Where to go after sign-in: `redirectTo` only when it is a path inside this app, otherwise `/`.
 * Rejects absolute URLs, protocol-relative `//host` and `/\host`, and anything the URL parser
 * resolves to another origin or to such a path (it strips tabs and newlines and resolves `.`/`..`
 * the way browsers do). No open redirect.
 */
export function safeRedirectPath(redirectTo: string | null): string {
  if (!redirectTo?.startsWith('/') || isProtocolRelative(redirectTo)) return '/';
  try {
    const url = new URL(redirectTo, BASE);
    const path = `${url.pathname}${url.search}${url.hash}`;
    // Checked again after parsing: dot-segments can rebuild `//host` (`/.//host`, `/a/..//host`).
    return url.origin === BASE && !isProtocolRelative(path) ? path : '/';
  } catch {
    return '/';
  }
}
