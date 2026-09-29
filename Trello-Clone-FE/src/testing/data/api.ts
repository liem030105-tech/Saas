import { testEnv } from './env';

import type { ErrorResponse } from '@trello-clone/shared';

/** Absolute URL for an API path, matching the axios baseURL used in tests. */
export const apiUrl = (path: string) => `${testEnv.VITE_API_URL}${path}`;

export const sampleResource = { id: 'clx0000000000000000000001', title: 'Sprint 1' };

/**
 * Builds a canonical error body (docs/api/README.md → Canonical error format), typed with the
 * shared contract so a change to it breaks these fixtures at compile time.
 */
export function buildErrorBody(overrides: Partial<ErrorResponse['error']> = {}): ErrorResponse {
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: [{ path: 'title', message: 'Required' }],
      requestId: 'req-test-0001',
      ...overrides,
    },
  };
}

/** An error body that is not the canonical format (e.g. from a proxy); maps to NETWORK_ERROR. */
export const nonCanonicalErrorBody = { message: 'Bad Gateway' };
