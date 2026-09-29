// Paths and payloads for the integration tests (tests/integration/*).
export const paths = {
  health: '/api/v1/health',
  register: '/api/v1/auth/register',
  login: '/api/v1/auth/login',
  unknown: '/api/v1/this-route-does-not-exist',
  // Test-only routes mounted through createApp({ extraRoutes }).
  validate: '/__test/validate',
  throws: '/__test/throws',
  params: '/__test/items/:id',
  rateLimited: '/__test/rate-limited',
} as const;

/** `%E0` is not valid percent-encoding, so the router cannot decode the :id parameter. */
export const undecodableParamPath = '/__test/items/%E0';

/** The allowed origin is testEnv.CLIENT_URL (tests/data/env.ts). */
export const disallowedOrigin = 'https://evil.example';

export const validBody = { title: 'Sprint 1' };

/** An unknown field the validator must strip rather than echo. */
export const unknownField = { extra: 'not in the schema' };

/** Empty `title`, plus an unknown field. */
export const invalidBody = { title: '', ...unknownField };

export const malformedJson = '{"title": ';

/** Just over the 1 MB JSON limit set in app.ts. */
export const tooLargeBody = { title: 'x'.repeat(1024 * 1024 + 1) };

/** Message of the error thrown by the test route; it must never reach the response. */
export const internalErrorMessage = 'database password is hunter2';

export const clientRequestId = 'client-req-0001';
export const unsafeRequestId = 'bad id with spaces';
