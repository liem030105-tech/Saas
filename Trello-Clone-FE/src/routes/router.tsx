import { createBrowserRouter, type RouteObject } from 'react-router';

import { ErrorFallback } from '@/components/feedback/ErrorBoundary';
import { restoreSession } from '@/features/auth';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { RegisterPage } from '@/pages/RegisterPage';

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
      { path: '/', element: <HomePage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      {
        // Signed in only: otherwise /login?redirectTo=<here>.
        element: <ProtectedRoute />,
        children: [{ path: '/settings/profile', element: <ProfilePage /> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
