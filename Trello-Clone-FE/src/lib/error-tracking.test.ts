import { boardUrl, inviteToken, inviteUrls, testSentryDsn } from '@/testing/data/error-tracking';

import * as Sentry from './sentry-sdk';

import type { ErrorEvent } from '@sentry/react';

vi.mock('./sentry-sdk', () => ({ init: vi.fn(), captureException: vi.fn() }));

// The module keeps the loaded SDK, so each test imports a fresh copy.
const load = async () => {
  vi.resetModules();
  return import('./error-tracking');
};

describe('error tracking', () => {
  afterEach(() => vi.clearAllMocks());

  it('redacts invite tokens in page URLs and leaves other URLs alone', async () => {
    const { redactUrl } = await load();

    for (const { raw, redacted } of Object.values(inviteUrls)) {
      expect(redactUrl(raw)).toBe(redacted);
    }
    expect(redactUrl(boardUrl)).toBe(boardUrl);
  });

  it('strips request headers, the user and invite tokens from events', async () => {
    const { scrubEvent } = await load();
    const event: ErrorEvent = {
      type: undefined,
      request: { url: inviteUrls.path.raw, headers: { Referer: inviteUrls.redirect.raw } },
      user: { ip_address: '203.0.113.7' },
      breadcrumbs: [
        { category: 'navigation', data: { from: inviteUrls.path.raw, to: boardUrl } },
        { category: 'xhr', data: { url: inviteUrls.redirect.raw, status_code: 500 } },
      ],
    };

    const scrubbed = scrubEvent(event);

    expect(JSON.stringify(scrubbed)).not.toContain(inviteToken);
    expect(scrubbed.request).toEqual({ url: inviteUrls.path.redacted });
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.breadcrumbs?.[1]?.data).toEqual({
      url: inviteUrls.redirect.redacted,
      status_code: 500,
    });
  });

  it('does nothing without a DSN', async () => {
    const { initErrorTracking, captureException } = await load();

    initErrorTracking({});
    captureException(new Error('boom'));
    await vi.dynamicImportSettled();

    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('starts Sentry with the scrubbers and reports caught errors', async () => {
    const { initErrorTracking, captureException, scrubEvent, scrubBreadcrumb } = await load();
    const error = new Error('boom');

    initErrorTracking({
      VITE_SENTRY_DSN: testSentryDsn,
      VITE_SENTRY_ENVIRONMENT: 'staging',
      VITE_VERCEL_GIT_COMMIT_SHA: 'abc123',
    });
    captureException(error);
    await vi.waitFor(() => expect(Sentry.captureException).toHaveBeenCalledWith(error));

    expect(Sentry.init).toHaveBeenCalledWith({
      dsn: testSentryDsn,
      environment: 'staging',
      release: 'abc123',
      dataCollection: expect.objectContaining({ cookies: false, httpHeaders: false }),
      beforeSend: scrubEvent,
      beforeBreadcrumb: scrubBreadcrumb,
    });
  });
});
