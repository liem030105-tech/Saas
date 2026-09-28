// User rows for tests. passwordHash is a placeholder: nothing here verifies passwords.
let sequence = 0;

export function buildUser(overrides: Partial<{ email: string; name: string }> = {}) {
  sequence += 1;
  return {
    email: `user${sequence}@example.test`,
    name: `Test User ${sequence}`,
    passwordHash: 'not-a-real-bcrypt-hash',
    ...overrides,
  };
}
