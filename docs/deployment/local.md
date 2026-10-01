# Local Environment (Docker)

> **Domain:** local infrastructure (Docker Compose). Dev setup: [development/setup.md](../development/setup.md).

`docker-compose.yml` at the root (created in Phase 0):

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: trello
      POSTGRES_PASSWORD: trello # local only
      POSTGRES_DB: trello
    ports: ['5432:5432']
    volumes: [pgdata:/var/lib/postgresql/data]
  postgres-test:
    image: postgres:16-alpine
    environment: { POSTGRES_USER: trello, POSTGRES_PASSWORD: trello, POSTGRES_DB: trello_test }
    ports: ['5433:5432']
    tmpfs: [/var/lib/postgresql/data] # throwaway test DB
volumes:
  pgdata:
```

- During development only Postgres runs in Docker; FE/BE run with `pnpm dev` for fast hot reload.
- To try a production-like build: each package gets its own `Dockerfile` (Phase 9); `api`/`web` services can be added to compose under a `full` profile.
- Wipe local data: `docker compose down -v`.
