import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, type RouteObject } from 'react-router';

import { AppProvider } from '@/app/provider';
import { routes } from '@/routes/router';

import type { ReactElement } from 'react';

const createTestQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

function renderRoutes(routeObjects: RouteObject[], route: string) {
  const queryClient = createTestQueryClient();
  const router = createMemoryRouter(routeObjects, { initialEntries: [route] });
  return {
    queryClient,
    router,
    ...render(<AppProvider queryClient={queryClient} router={router} />),
  };
}

/** Renders the real route tree at `route`. */
export const renderApp = (route = '/') => renderRoutes(routes, route);

/** Renders `ui` with every provider, mounted at `path` and visited at `route`. */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', path = '*' }: { route?: string; path?: string } = {},
) {
  return renderRoutes([{ path, element: ui }], route);
}
