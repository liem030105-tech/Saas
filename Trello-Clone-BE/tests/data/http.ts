// Paths and payloads for the app-level integration tests (tests/integration/app.test.ts).
export const paths = {
  health: '/api/v1/health',
  unknown: '/api/v1/this-route-does-not-exist',
  // Test-only routes mounted through createApp({ extraRoutes }).
  validate: '/__test/validate',
  throws: '/__test/throws',
} as const;

export const validBody = { title: 'Sprint 1' };

/** Missing `title`, plus an unknown field the validator must strip rather than echo. */
export const invalidBody = { title: '', extra: 'ignored' };

export const malformedJson = '{"title": ';

/** Message of the error thrown by the test route; it must never reach the response. */
export const internalErrorMessage = 'database password is hunter2';

export const clientRequestId = 'client-req-0001';
export const unsafeRequestId = 'bad id with spaces';
