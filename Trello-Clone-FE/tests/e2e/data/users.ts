// Generated E2E users: a unique email per call, so runs never collide and no real account is used.

export function buildE2eUser() {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: `E2E User ${id}`,
    email: `e2e.${id}@example.test`,
    password: 'correct horse battery staple',
  };
}

export type E2eUser = ReturnType<typeof buildE2eUser>;
