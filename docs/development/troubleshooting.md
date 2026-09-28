# Troubleshooting

> **Domain:** common development problems and fixes. Add an entry whenever you hit a new one.

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `P1001 Can't reach database server` | Postgres is not running | `pnpm db:up`; check `DATABASE_URL` |
| `Cannot find module '@trello-clone/shared'` | Shared not built or not installed | `pnpm install`, `pnpm --filter @trello-clone/shared build` |
| Prisma client is missing a new model | Client not regenerated | `pnpm --filter @trello-clone/api exec prisma generate` |
| CORS error in the browser | `CLIENT_URL` does not match the FE origin | Fix the BE `.env` and restart |
| Refresh-token cookie not sent | Missing credentials | axios needs `withCredentials: true`; locally use the same host (`localhost`, not mixed with `127.0.0.1`) |
| Logged out repeatedly after refresh | Two concurrent refreshes → token treated as reused | The interceptor must share a single refresh promise |
| Socket connects then drops | Access token expired | Refresh, then reconnect (see realtime.md) |
| Dragged card snaps back | Mutation failed and rolled back | Check the Network tab and the error response |
| Integration tests pass alone but fail together | Data shared between test files | Reset the DB per file; run serially (`--pool=forks --poolOptions.forks.singleFork`) |
