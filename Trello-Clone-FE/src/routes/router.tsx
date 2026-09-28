import { createBrowserRouter, type RouteObject } from 'react-router';

import { ErrorFallback } from '@/components/feedback/ErrorBoundary';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RegisterPage } from '@/pages/RegisterPage';

// Exported so tests can mount the same tree in a memory router (src/testing/render.tsx).
export const routes: RouteObject[] = [
  {
    errorElement: <ErrorFallback />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
