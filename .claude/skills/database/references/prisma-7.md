# Prisma 7 setup (ADR-015)

Prisma 7 differs from most tutorials (which show Prisma 5/6). Do it this way:

## `prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client"            // not "prisma-client-js"
  output   = "../src/generated/prisma"  // required; git-ignored
}

datasource db {
  provider = "postgresql"               // no url here in Prisma 7
}
```

## `prisma.config.ts` (package root)
```ts
import 'dotenv/config'; // Prisma 7 does not load environment files by itself
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: env('DATABASE_URL') },
});
```

## `src/config/prisma.ts`
```ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env } from './env';

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
```
Tests build a second client the same way from `DATABASE_URL_TEST`.

## Commands
| Script | Runs |
|--------|------|
| `db:generate` | `prisma generate` (after every schema change and after a fresh install) |
| `db:migrate` | `prisma migrate dev --name <snake_case>` (local DB only) |
| `db:seed` | `prisma db seed` |
| `db:studio` | `prisma studio` |

If a snippet from memory or the web uses `prisma-client-js`, `url = env(...)` in the schema, or `new PrismaClient()` without an adapter, it is Prisma 6 style: translate it to the above. When unsure, check the Prisma 7 docs rather than guessing.
