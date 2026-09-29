// The access token lives only in memory (security.md → Frontend token handling): never in
// localStorage, sessionStorage, a cookie, or a persisted store. A reload loses it; AUTH-003
// restores the session with /auth/refresh (the refresh token is an HttpOnly cookie JS never sees).
let accessToken: string | null = null;

export const getAccessToken = () => accessToken;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
