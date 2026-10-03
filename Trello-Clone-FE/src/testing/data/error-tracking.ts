// Error tracking (ADR-024). No Sentry project behind the DSN: the tests mock the SDK.
export const testSentryDsn = 'https://publickey@sentry.example.invalid/1';

export const inviteToken = 'secret-invite-token';

/** Page URLs that carry an invite token, and what Sentry may receive instead. */
export const inviteUrls = {
  path: {
    raw: `https://app.example.com/invite/${inviteToken}`,
    redacted: 'https://app.example.com/invite/[redacted]',
  },
  redirect: {
    raw: `https://app.example.com/login?redirectTo=%2Finvite%2F${inviteToken}`,
    redacted: 'https://app.example.com/login?redirectTo=%2Finvite%2F[redacted]',
  },
};

export const boardUrl = 'https://app.example.com/b/board-1';
