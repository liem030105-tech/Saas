import { buildErrorBody } from './api';

import type { AuthResponse } from '@trello-clone/shared';

/** What a user types into the register form. */
export const registerFormInput = {
  name: 'Ada Lovelace',
  email: 'ada@example.test',
  password: 'correct horse battery',
};

export const registerResponse: AuthResponse = {
  user: {
    id: 'clx0000000000000000000001',
    email: registerFormInput.email,
    name: registerFormInput.name,
    avatarUrl: null,
    createdAt: '2026-09-29T10:00:00.000Z',
  },
  accessToken: 'header.payload.signature',
};

/** The BE's 409 body for an email that is already registered. */
export const emailTakenBody = buildErrorBody({
  code: 'CONFLICT',
  message: 'An account with this email already exists',
  details: [],
});

/** What a proxy returns when the API is down: no canonical error body. */
export const proxyErrorPage = { status: 502, html: '<html><body>502 Bad Gateway</body></html>' };

/** Shown whenever the error carries no user-facing message. */
export const genericRegisterError =
  "Couldn't create your account. Check your connection and try again.";

/** Form input the shared schema rejects, with the message shown under each field. */
export const invalidRegisterForm = {
  input: { name: '   ', email: 'not-an-email', password: 'short' },
  messages: {
    name: 'Enter your name',
    email: 'Enter a valid email address',
    password: 'Password must be at least 8 characters',
  },
};

/** What a user types into the login form. */
export const loginFormInput = { email: registerFormInput.email, password: 'correct horse battery' };

export const loginResponse: AuthResponse = registerResponse;

/** The BE's 401 body, identical for an unknown email and a wrong password. */
export const invalidCredentialsBody = buildErrorBody({
  code: 'INVALID_CREDENTIALS',
  message: 'Incorrect email or password',
  details: [],
});

export const genericLoginError = "Couldn't sign you in. Check your connection and try again.";

/** Login form input the shared schema rejects, with the message shown under each field. */
export const invalidLoginForm = {
  input: { email: 'not-an-email', password: '' },
  messages: { email: 'Enter a valid email address', password: 'Enter your password' },
};

/** A safe `redirectTo` value and where it leads (a path of the route tree in tests). */
export const safeRedirect = { redirectTo: '/register?from=login', path: '/register' };

/** `redirectTo` values that point outside the app; login must ignore them and go to `/`. */
export const unsafeRedirects = [
  'https://evil.example/phish',
  '//evil.example/phish',
  '/\\evil.example/phish',
  '/\t/evil.example/phish',
  '/.//evil.example/phish',
  '/./\\evil.example/phish',
  '/a/..//evil.example/phish',
  'javascript:alert(1)',
  'relative/path',
  '',
];

/** The BE's 401 for /auth/refresh without a valid cookie: a signed-out visitor. */
export const refreshUnauthorizedBody = buildErrorBody({
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
  details: [],
});

/** The BE's 401 for a replayed refresh token (the whole family was revoked). */
export const tokenReusedBody = buildErrorBody({
  code: 'TOKEN_REUSED',
  message: 'Your session has expired. Log in again.',
  details: [],
});

/** Access tokens before and after a refresh. */
export const staleAccessToken = 'stale.access.token';
export const freshAccessToken = 'fresh.access.token';

/** A protected API path used by the interceptor tests (any non-auth endpoint). */
export const protectedPath = '/workspaces';

export const sessionExpiredMessage = 'Your session has expired. Log in again.';

/** The BE's 401 for a protected endpoint called with an expired access token. */
export const accessTokenExpiredBody = buildErrorBody({
  code: 'UNAUTHORIZED',
  message: 'Authentication required',
  details: [],
});

/** A 403 from a protected endpoint: not a session problem, so never a refresh. */
export const forbiddenBody = buildErrorBody({
  code: 'FORBIDDEN',
  message: 'You do not have permission to do this',
  details: [],
});

/** The API is down: a 5xx from /auth/refresh says nothing about the session. */
export const serverErrorBody = buildErrorBody({
  code: 'INTERNAL_ERROR',
  message: 'Something went wrong',
  details: [],
});
