import { assertTestDatabaseUrl } from './test-database';
import { createPrismaClient } from '../../src/config/prisma';

// Migrations are applied once per run by tests/global-setup.ts.
export const testPrisma = createPrismaClient(assertTestDatabaseUrl(process.env.DATABASE_URL_TEST));

/** Empties every application table (TRUNCATE … CASCADE); call it per test file. */
export async function resetDb() {
  // One static statement (a tagged template, no SQL built in JS): Postgres lists the tables
  // and quotes each name with format('%I'), so new models are covered without edits here.
  await testPrisma.$executeRaw`
    DO $$
    DECLARE statement text;
    BEGIN
      SELECT 'TRUNCATE TABLE '
          || string_agg(format('%I.%I', schemaname, tablename), ', ')
          || ' RESTART IDENTITY CASCADE'
        INTO statement
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
      IF statement IS NOT NULL THEN
        EXECUTE statement;
      END IF;
    END $$`;
}
