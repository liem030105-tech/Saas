# Auth on the client (AUTH-003…006)

Spec: [security.md → Frontend token handling](../../../../docs/architecture/security.md#frontend-token-handling). The refresh token is an httpOnly cookie the FE never sees; the access token lives only in memory.

## `api/token.ts`
```ts
let accessToken: string | null = null;
export const getAccessToken = () => accessToken;
export const setAccessToken = (token: string | null) => { accessToken = token; };
```
Never put the token in `localStorage`, `sessionStorage`, a cookie, or a Zustand store that persists.

## `api/client.ts` – one axios instance, one refresh at a time
```ts
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { env } from '@/config/env';
import { getAccessToken, setAccessToken } from './token';

export const http = axios.create({ baseURL: env.VITE_API_URL, withCredentials: true }); // cookie on /auth/*

http.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string> | null = null; // shared by every request that hits a 401

export function refreshAccessToken() {
  refreshing ??= http
    .post<{ data: { accessToken: string } }>('/auth/refresh')
    .then((res) => {
      setAccessToken(res.data.data.accessToken);
      return res.data.data.accessToken;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

http.interceptors.response.use(undefined, async (error: AxiosError<{ error?: { code?: string } }>) => {
  const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
  const code = error.response?.data?.error?.code;
  const isAuthCall = original?.url?.startsWith('/auth/');
  if (error.response?.status === 401 && code === 'UNAUTHORIZED' && original && !original._retried && !isAuthCall) {
    original._retried = true;
    try {
      await refreshAccessToken();
      return http(original);                   // retry once with the new token
    } catch {
      onSessionEnded('expired');               // clear state, go to /login
    }
  }
  if (code === 'TOKEN_REUSED') onSessionEnded('reused'); // "Your session expired" and force logout
  throw toApiError(error);                     // canonical error → ApiError
});
```
- `apiClient` (FOUNDATION-003) is a thin typed wrapper over this `http` instance that unwraps `{ data }`; features use `apiClient`, never `http` or a new axios instance.
- Concurrent 401s share `refreshing`, so the server sees one refresh. Two parallel refreshes would rotate the same token twice and trigger reuse detection, logging the user out.
- `/auth/*` calls are never retried through the interceptor (avoids loops).

## Session restore
On app start, `app/provider.tsx` calls `refreshAccessToken()` once before rendering protected routes; a failure means "signed out". `ProtectedRoute` waits for that result instead of redirecting too early.

## Logout
`POST /auth/logout`, then `setAccessToken(null)`, `queryClient.clear()`, navigate to `/login`. Clearing the cache prevents the next user on the same browser from seeing the previous user's data.

## Tests
Hook/interceptor tests with MSW: two concurrent 401s trigger exactly one `/auth/refresh`; a failed refresh redirects to `/login`; `TOKEN_REUSED` forces logout. E2E scenario 1 covers reload keeping the session.
