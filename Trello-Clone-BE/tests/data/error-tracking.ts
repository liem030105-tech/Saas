// Error tracking (ADR-024). No Sentry project behind the DSN: the tests replace the transport, so
// nothing leaves the process.
export const testSentryDsn = 'https://publickey@sentry.example.invalid/1';

/** Request details that must never reach Sentry (lib/error-tracking.ts → scrubEvent). */
export const sensitiveRequest = {
  authorization: 'Bearer secret-access-token',
  cookie: 'refreshToken=secret-refresh-token',
  query: '?token=secret-invite-token',
};

/** An event as Sentry's request integration may build it, before scrubEvent. */
export const unscrubbedEvent = {
  type: undefined,
  request: {
    method: 'POST',
    url: `https://api.example.com/api/v1/invites/accept${sensitiveRequest.query}`,
    query_string: sensitiveRequest.query.slice(1),
    headers: { authorization: sensitiveRequest.authorization },
    cookies: { refreshToken: 'secret-refresh-token' },
    data: { token: 'secret-invite-token' },
  },
  user: { ip_address: '203.0.113.7' },
};
