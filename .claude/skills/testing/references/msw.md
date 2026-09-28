# FE tests with MSW (Vitest 4 + Testing Library)

- Handlers live in `Trello-Clone-FE/src/testing/mocks/handlers.ts`; the Node server in `src/testing/mocks/server.ts` is started in the Vitest setup file (`listen({ onUnhandledRequest: 'error' })`, `resetHandlers()` after each test, `close()` after all).
- Render through `renderWithProviders` from `src/testing/render.tsx` (a fresh `QueryClient` with `retry: false` per test, the router, the Sonner `Toaster`).
- Response bodies follow the API envelope: `{ data: … }` on success, the canonical `{ error: { code, message, details, requestId } }` on errors. Type them with `@trello-clone/shared` so a contract change breaks the test at compile time.

```tsx
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { server } from '@/testing/mocks/server';
import { renderWithProviders } from '@/testing/render';

it('rolls back the optimistic move when the API fails', async () => {
  server.use(
    http.patch('*/cards/:cardId/move', () =>
      HttpResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Forbidden', details: [], requestId: 't' } },
        { status: 403 },
      ),
    ),
  );
  renderWithProviders(<BoardPage />, { route: '/b/board-1' });
  // …perform the move, then assert the card is back in its original list and an error toast is shown
  expect(await screen.findByText(/could not move/i)).toBeInTheDocument();
});
```
Test what the user sees (text, roles, order). Do not assert on hook internals, and do not mock modules where MSW can mock the network.
