# Troubleshooting

> **Domain:** common development problems and fixes. Add an entry whenever you hit a new one.

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `P1001 Can't reach database server` | Postgres is not running | `pnpm db:up`; check `DATABASE_URL` |
| `Cannot find module '@trello-clone/shared'` | Workspace link missing, or an import of a path the package does not export | `pnpm install`; import only from `@trello-clone/shared` (its `exports` points at `src/index.ts`) |
| `Ignored build scripts` warning after install | pnpm 10 blocks dependency install scripts | Add the package to `onlyBuiltDependencies` in `pnpm-workspace.yaml` only if it is listed in ADR-015 or justified in the PR |
| `Cannot find module '…/generated/prisma'`, or the client is missing a new model | Prisma client not generated since the last schema change | `pnpm --filter @trello-clone/api db:generate` |
| CORS error in the browser | `CLIENT_URL` does not match the FE origin | Fix the BE `.env` and restart |
| Refresh-token cookie not sent | Missing credentials | axios needs `withCredentials: true`; locally use the same host (`localhost`, not mixed with `127.0.0.1`) |
| Logged out repeatedly after refresh | Two concurrent refreshes → token treated as reused | The interceptor must share a single refresh promise |
| Socket connects then drops | Access token expired | Refresh, then reconnect (see realtime.md) |
| Dragged card snaps back | Mutation failed and rolled back | Check the Network tab and the error response |
| Integration tests pass alone but fail together | Data shared between test files | Reset the DB per file; run serially (`--pool=forks --poolOptions.forks.singleFork`) |
