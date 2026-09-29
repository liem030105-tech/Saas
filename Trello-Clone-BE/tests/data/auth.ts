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

/** The seeded user's name (tests/helpers/auth.ts → seedLoginUser). */
export const seededUserName = 'Grace Hopper';

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

/** A refresh cookie value that was never issued. */
export const unknownRefreshToken = 'never-issued-refresh-token-value-0000000000';

/** Cookie values cookie-parser turns into JSON (`j:` prefix); they must count as no token. */
export const jsonRefreshCookies = ['j:{}', 'j:1', 'j:["a"]'];

/** An email sent to PATCH /users/me: stripped, since email changes are out of scope. */
export const strippedEmail = 'new@example.test';

/** Profile updates for PATCH /users/me. */
export const profileUpdates = {
  name: { input: { name: '  Grace B. Hopper ' }, stored: 'Grace B. Hopper' },
  avatarUrl: 'https://cdn.example.test/avatars/grace.png',
};

/** One invalid PATCH /users/me body per rule; each must fail with 400. */
export const invalidProfileBodies = [
  { case: 'no fields', body: {} },
  { case: 'only an email (email changes are out of scope)', body: { email: strippedEmail } },
  { case: 'blank name', body: { name: '   ' } },
  { case: 'name over 100 chars', body: { name: 'n'.repeat(101) } },
  { case: 'http avatar URL', body: { avatarUrl: 'http://cdn.example.test/a.png' } },
  { case: 'javascript: avatar URL', body: { avatarUrl: 'javascript:alert(1)' } },
  {
    case: 'avatar URL over 2048 chars',
    body: { avatarUrl: `https://cdn.example.test/${'a'.repeat(2030)}` },
  },
] as const;

/** A secret other than testEnv.JWT_ACCESS_SECRET, for wrongly signed tokens. */
export const foreignJwtSecret = 'someone-elses-secret-0123456789abcdef';

/** Authorization header values that are not `Bearer <jwt>`. */
export const malformedAuthHeaders = [
  'Bearer',
  'Bearer not-a-jwt',
  'Basic dXNlcjpwYXNz',
  'bearer a.b.c',
  'Bearer a.b.c d',
];
