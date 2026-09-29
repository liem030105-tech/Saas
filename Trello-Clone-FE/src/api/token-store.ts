// The access token lives only in memory (security.md → Frontend token handling): never in
// localStorage, sessionStorage, a cookie, or a persisted store. A reload loses it; the session is
// restored with /auth/refresh (features/auth/session.ts); the refresh token is an HttpOnly cookie.
let accessToken: string | null = null;

export const getAccessToken = () => accessToken;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
