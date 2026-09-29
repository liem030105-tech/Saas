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
- `refreshAccessToken()` holds one shared promise while `/auth/refresh` is in flight, so concurrent 401s make the server see one refresh. Two parallel refreshes would rotate the same token twice and trigger reuse detection, logging the user out. A failed refresh clears the token.
- The response interceptor handles only `401 UNAUTHORIZED`, retries each request **once**, and skips the session endpoints (`/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`) to avoid loops. A request whose token was already replaced by a concurrent refresh retries with the new token without refreshing again.
- When the refresh fails it calls the handler registered with `onSessionEnded(reason)` (`'expired'` or `'reused'` for `TOKEN_REUSED`). `api/` never imports the router.
- `apiClient` (FOUNDATION-003) is a thin typed wrapper over `http` that unwraps `{ data }`; features use `apiClient`, never `http` or a new axios instance.

## Session restore and session end (`features/auth/session.ts`)
- `restoreSession` is the root route's `loader` (`shouldRevalidate: () => false`): one `/auth/refresh` on app start before any page renders; a failure means "signed out". `ProtectedRoute` (AUTH-005) can therefore read the result synchronously.
- `handleSessionEnd(router, queryClient)` is registered by `app/provider.tsx`: it clears the query cache, shows "Your session has expired. Log in again." (one toast id), and navigates to `/login?redirectTo=<current path>`.

## Logout
`POST /auth/logout`, then `setAccessToken(null)`, `queryClient.clear()`, navigate to `/login`. Clearing the cache prevents the next user on the same browser from seeing the previous user's data.

## Tests
Hook/interceptor tests with MSW: two concurrent 401s trigger exactly one `/auth/refresh`; a failed refresh redirects to `/login`; `TOKEN_REUSED` forces logout. E2E scenario 1 covers reload keeping the session.
The default MSW handlers (`src/testing/mocks/handlers.ts`) answer `/auth/refresh` with `401`, so every rendered app starts signed out; a test that needs a session overrides it. Pages render after the root loader, so tests wait with `findBy…` before interacting.
