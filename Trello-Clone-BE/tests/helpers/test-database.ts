/**
 * Refuses anything but a database whose name ends in `_test`, so a misconfigured URL can never
 * truncate the development database (FOUNDATION-004 → Risks).
 */
export function assertTestDatabaseUrl(url: string | undefined): string {
  if (!url) throw new Error('DATABASE_URL_TEST is not set; tests need the postgres-test database.');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against database "${name}": its name must end in _test.`,
    );
  }
  return url;
}
