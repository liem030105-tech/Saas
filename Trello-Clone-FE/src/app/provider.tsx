import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { RouterProvider, type createBrowserRouter } from 'react-router';

import { ErrorBoundary } from '@/components/feedback/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { handleSessionEnd } from '@/features/auth';

type Router = ReturnType<typeof createBrowserRouter>;

interface AppProviderProps {
  queryClient: QueryClient;
  router: Router;
}

/** Every app-wide provider, in one place (frontend.md). Tests pass their own client and router. */
export function AppProvider({ queryClient, router }: AppProviderProps) {
  // A session that cannot be refreshed sends the user to /login (features/auth/session.ts).
  useEffect(() => handleSessionEnd(router, queryClient), [router, queryClient]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster richColors closeButton />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
