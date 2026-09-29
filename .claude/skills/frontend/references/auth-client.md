# Auth on the client (AUTH-003…006)

Spec: [security.md → Frontend token handling](../../../../docs/architecture/security.md#frontend-token-handling). The refresh token is an httpOnly cookie the FE never sees; the access token lives only in memory.

## `api/token-store.ts` (AUTH-001)
```ts
let accessToken: string | null = null;
export const getAccessToken = () => accessToken;
export const setAccessToken = (token: string | null) => { accessToken = token; };
```
Never put the token in `localStorage`, `sessionStorage`, a cookie, or a Zustand store that persists.

## `api/client.ts` – one axios instance, one refresh at a time (AUTH-003)
The code is in `src/api/client.ts`; the rules it follows:
- A request interceptor adds `Authorization: Bearer <token>` from the token store.
- `refreshAccessToken()` holds one shared promise while `/auth/refresh` is in flight, so concurrent 401s make the server see one refresh. Two parallel refreshes would rotate the same token twice and trigger reuse detection, logging the user out. A refresh that answers 401 (`isSessionOver`) clears the token; a 5xx or network error keeps it.
- The response interceptor handles only `401 UNAUTHORIZED`, retries each request **once**, and skips the session endpoints (`/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`) to avoid loops. A request whose token was already replaced by a concurrent refresh retries with the new token without refreshing again.
- When the refresh answers 401 it calls the handler registered with `onSessionEnded(reason)` (`'expired'` or `'reused'` for `TOKEN_REUSED`). `api/` never imports the router.
- `apiClient` (FOUNDATION-003) is a thin typed wrapper over `http` that unwraps `{ data }`; features use `apiClient`, never `http` or a new axios instance.

## Session restore and session end (`features/auth/session.ts`)
- `restoreSession` is the root route's `loader` (`shouldRevalidate: () => false`): one `/auth/refresh` on app start before any page renders; a 401 means "signed out"; any other failure is thrown to the route's error page (reload), so an outage never looks like a sign-out. `ProtectedRoute` therefore reads the result synchronously (`getAccessToken()`): no token means signed out, never "still loading".
- `handleSessionEnd(router, queryClient)` is registered by `app/provider.tsx`: it clears the query cache, shows "Your session has expired. Log in again." (one toast id), and navigates to `/login?redirectTo=<current path>`.

## Logout
`features/auth/useLogout.ts` (AUTH-004), from the header's user menu: `POST /auth/logout`, then, whatever the server answered, `setSignedOutByUser(true)`, `setAccessToken(null)`, `queryClient.clear()`, and navigate to `/login`. The flag (reset on the next sign-in) makes `loginPathFor` return a plain `/login`, so a protected page that re-renders during the navigation never adds a `redirectTo` to the previous user's page. Clearing the cache prevents the next user on the same browser from seeing the previous user's data. If the request fails, a toast says the server session may survive (a reload could restore it).

`ProtectedRoute` reads the token on render and does not subscribe to it: whoever clears the token also navigates away (`handleSessionEnd`, `useLogout`), so a protected page is never left showing without a session.

## Tests
Hook/interceptor tests with MSW: two concurrent 401s trigger exactly one `/auth/refresh`; a failed refresh redirects to `/login`; `TOKEN_REUSED` forces logout. E2E scenario 1 covers reload keeping the session.
The default MSW handlers (`src/testing/mocks/handlers.ts`) answer `/auth/refresh` with `401`, so every rendered app starts signed out; a test that needs a session overrides it. Pages render after the root loader, so tests wait with `findBy…` before interacting.
