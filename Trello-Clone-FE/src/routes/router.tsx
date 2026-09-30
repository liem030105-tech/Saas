import { createBrowserRouter, type RouteObject } from 'react-router';

import { ErrorFallback } from '@/components/feedback/ErrorBoundary';
import { restoreSession } from '@/features/auth';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { RegisterPage } from '@/pages/RegisterPage';
import { WorkspacePage } from '@/pages/WorkspacePage';
import { WorkspaceSettingsPage } from '@/pages/WorkspaceSettingsPage';

import { HomeRoute } from './HomeRoute';
import { ProtectedRoute } from './ProtectedRoute';

// Exported so tests can mount the same tree in a memory router (src/testing/render.tsx).
export const routes: RouteObject[] = [
  {
    // Restores the session once (POST /auth/refresh) before any page renders; never re-run.
    loader: restoreSession,
    shouldRevalidate: () => false,
    hydrateFallbackElement: <div aria-busy="true" className="min-h-svh" />,
    errorElement: <ErrorFallback />,
    children: [
      // Public home when signed out; first workspace or the first-workspace screen when signed in.
      { path: '/', element: <HomeRoute /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      {
        // Signed in only: otherwise /login?redirectTo=<here>.
        element: <ProtectedRoute />,
        children: [
          { path: '/settings/profile', element: <ProfilePage /> },
          { path: '/w/:slug', element: <WorkspacePage /> },
          { path: '/w/:slug/settings', element: <WorkspaceSettingsPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
