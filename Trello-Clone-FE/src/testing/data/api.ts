import { testEnv } from './env';

import type { ApiErrorDetail } from '@/api/client';

/** Absolute URL for an API path, matching the axios baseURL used in tests. */
export const apiUrl = (path: string) => `${testEnv.VITE_API_URL}${path}`;

export const sampleResource = { id: 'clx0000000000000000000001', title: 'Sprint 1' };

interface ErrorOverrides {
  code?: string;
  message?: string;
  details?: ApiErrorDetail[];
  requestId?: string;
}

/** Builds a canonical error body (docs/api/README.md → Canonical error format). */
export function buildErrorBody(overrides: ErrorOverrides = {}) {
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
