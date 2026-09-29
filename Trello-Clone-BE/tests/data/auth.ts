// Register payloads for the auth tests. Passwords here are test values, never real credentials.
let sequence = 0;

/** A valid register body with a unique email per call. */
export function buildRegisterInput(
  overrides: Partial<Record<'email' | 'password' | 'name', string>> = {},
) {
  sequence += 1;
  return {
    email: `new.user${sequence}@example.test`,
    password: 'correct horse battery',
    name: `New User ${sequence}`,
    ...overrides,
  };
}

/** Mixed case and surrounding spaces; stored as `emailNormalized`. */
export const mixedCaseEmail = {
  input: '  Ada.Lovelace@Example.TEST ',
  normalized: 'ada.lovelace@example.test',
};

/** One invalid body per rule; each must fail with 400 and a detail for `field`. */
export const invalidRegisterBodies = [
  { case: 'missing email', field: 'email', body: { password: 'correct horse', name: 'Ada' } },
  {
    case: 'email not an email',
    field: 'email',
    body: { email: 'nope', password: 'correct horse', name: 'Ada' },
  },
  {
    case: 'email over 254 chars',
    field: 'email',
    body: { email: `${'a'.repeat(250)}@x.io`, password: 'correct horse', name: 'Ada' },
  },
  { case: 'missing password', field: 'password', body: { email: 'a@example.test', name: 'Ada' } },
  {
    case: 'password under 8 chars',
    field: 'password',
    body: { email: 'a@example.test', password: 'short', name: 'Ada' },
  },
  {
    case: 'password over 72 chars',
    field: 'password',
    body: { email: 'a@example.test', password: 'p'.repeat(73), name: 'Ada' },
  },
  {
    case: 'missing name',
    field: 'name',
    body: { email: 'a@example.test', password: 'correct horse' },
  },
  {
    case: 'name only spaces',
    field: 'name',
    body: { email: 'a@example.test', password: 'correct horse', name: '   ' },
  },
  {
    case: 'name over 100 chars',
    field: 'name',
    body: { email: 'a@example.test', password: 'correct horse', name: 'n'.repeat(101) },
  },
] as const;

/** Refresh cookie contract (docs/api/authentication.md), with the D-02 proposed 30 days. */
export const expectedRefreshCookie = {
  name: 'refresh_token',
  path: '/api/v1/auth',
  maxAgeSeconds: 30 * 24 * 60 * 60,
};

/** Access token lifetime from ACCESS_TOKEN_TTL=15m in tests/data/env.ts (D-01). */
export const accessTokenTtlSeconds = 15 * 60;

/** A registered user's credentials for the login tests (the user is created with this password). */
export const loginCredentials = {
  email: 'grace.hopper@example.test',
  password: 'correct horse battery',
  /** How the user may type the email: login normalizes it like register. */
  typedEmail: '  Grace.Hopper@Example.TEST ',
  wrongPassword: 'incorrect horse battery',
  unknownEmail: 'nobody@example.test',
};

/** The one message for an unknown email and a wrong password (no user enumeration). */
export const invalidCredentialsMessage = 'Incorrect email or password';

/** One invalid login body per rule; each must fail with 400 and a detail for `field`. */
export const invalidLoginBodies = [
  { case: 'missing email', field: 'email', body: { password: 'correct horse' } },
  { case: 'email not an email', field: 'email', body: { email: 'nope', password: 'x' } },
  { case: 'missing password', field: 'password', body: { email: 'a@example.test' } },
  { case: 'empty password', field: 'password', body: { email: 'a@example.test', password: '' } },
  {
    case: 'password over 72 chars',
    field: 'password',
    body: { email: 'a@example.test', password: 'p'.repeat(73) },
  },
] as const;
