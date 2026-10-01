import { http, HttpResponse, type RequestHandler } from 'msw';

import { apiUrl } from '@/testing/data/api';
import { refreshUnauthorizedBody } from '@/testing/data/auth';
import { membersWith } from '@/testing/data/workspaces';

// Default handlers shared by every test; tests override per case with server.use(...).
export const handlers: RequestHandler[] = [
  // The app restores the session on start (features/auth/session.ts); by default nobody is signed in.
  http.post(apiUrl('/auth/refresh'), () =>
    HttpResponse.json(refreshUnauthorizedBody, { status: 401 }),
  ),
  // A signed-in user has no workspaces until a test says otherwise (first-workspace screen).
  http.get(apiUrl('/workspaces'), () => HttpResponse.json({ data: [] })),
  // A workspace has no boards until a test says otherwise (BOARD-001).
  http.get(apiUrl('/workspaces/:workspaceId/boards'), () => HttpResponse.json({ data: [] })),
  // The signed-in user and two others, until a test says otherwise (the board page assigns them).
  http.get(apiUrl('/workspaces/:workspaceId/members'), () =>
    HttpResponse.json({ data: membersWith('MEMBER') }),
  ),
];
