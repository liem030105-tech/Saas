import { http, HttpResponse, type RequestHandler } from 'msw';

import { apiUrl } from '@/testing/data/api';
import { refreshUnauthorizedBody } from '@/testing/data/auth';
import { freeBilling } from '@/testing/data/billing';
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
  // A Free workspace that never subscribed, until a test says otherwise (settings, BILLING-001).
  http.get(apiUrl('/workspaces/:workspaceId/billing'), () =>
    HttpResponse.json({ data: freeBilling }),
  ),
  // A board has no activity until a test says otherwise (the activity feed, CARD-005e).
  http.get(apiUrl('/boards/:boardId/activities'), () =>
    HttpResponse.json({ data: [], nextCursor: null }),
  ),
  // A card has no comments until a test says otherwise (the card modal lists them, CARD-005d).
  http.get(apiUrl('/cards/:cardId/comments'), () =>
    HttpResponse.json({ data: [], nextCursor: null }),
  ),
  // No notifications until a test says otherwise (the header's bell, NOTIFICATIONS-001).
  http.get(apiUrl('/notifications'), () => HttpResponse.json({ data: [], nextCursor: null })),
  http.get(apiUrl('/notifications/unread-count'), () => HttpResponse.json({ data: { count: 0 } })),
];
