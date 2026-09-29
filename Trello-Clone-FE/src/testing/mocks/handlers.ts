import { http, HttpResponse, type RequestHandler } from 'msw';

import { apiUrl } from '@/testing/data/api';
import { refreshUnauthorizedBody } from '@/testing/data/auth';

// Default handlers shared by every test; tests override per case with server.use(...).
export const handlers: RequestHandler[] = [
  // The app restores the session on start (features/auth/session.ts); by default nobody is signed in.
  http.post(apiUrl('/auth/refresh'), () =>
    HttpResponse.json(refreshUnauthorizedBody, { status: 401 }),
  ),
];
