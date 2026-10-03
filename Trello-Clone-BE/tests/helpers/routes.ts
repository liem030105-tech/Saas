import type { Express } from 'express';

// The app's registered routes (TESTING-001), for the coverage tests that make every route carry
// its baseline cases: the 401 and 400 suites (baseline.test.ts), the role matrix and tenant
// isolation. Walks the router stack, descending into mounted routers.

interface Layer {
  route?: { path: string; methods: Record<string, boolean>; stack: { name: string }[] };
  handle?: { stack?: Layer[] };
}

export interface RegisteredRoute {
  /** `METHOD /path/:param` exactly as registered (without the /api/v1 prefix). */
  route: string;
  method: string;
  path: string;
  /** Names of the route's middleware and handler, in order (e.g. authenticate, validateRequest). */
  handlers: string[];
}

const walk = (stack: Layer[]): RegisteredRoute[] =>
  stack.flatMap((layer) => {
    if (layer.route) {
      const { path, methods, stack: handlers } = layer.route;
      return Object.keys(methods).map((method) => ({
        route: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        handlers: handlers.map((handler) => handler.name),
      }));
    }
    return layer.handle?.stack ? walk(layer.handle.stack) : [];
  });

/** Every route of `app`, without the test-only `/__test/*` ones (test-app.ts). */
export const registeredRoutes = (app: Express): RegisteredRoute[] =>
  walk((app as unknown as { router: { stack: Layer[] } }).router.stack).filter(
    ({ path }) => !path.startsWith('/__test'),
  );
