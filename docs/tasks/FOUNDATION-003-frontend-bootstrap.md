# FOUNDATION-003: Frontend bootstrap

| Field | Value |
|-------|-------|
| Phase | 0 (MVP) |
| Depends on | FOUNDATION-001 |
| Blocked by decisions | none |
| Skills | frontend |

# Goal
A runnable React 19 + Vite + TypeScript app (`@trello-clone/web`) with the folder structure, routing, styling, and data-fetching providers in place.

# Context
Structure and rules per [architecture/frontend.md](../architecture/frontend.md).

# Requirements
1. Package `Trello-Clone-FE` named `@trello-clone/web`; scripts `dev`, `build`, `preview`, `lint`, `typecheck`, `test`. `tsconfig.json` extends `../tsconfig.base.json`, maps `@/*` to `src/*`, and includes `src` and `tests`.
2. Tailwind CSS 4 via `@tailwindcss/vite` (CSS-based config, no `tailwind.config.js`); shadcn/ui initialized with `Button`, `Input`, `Dialog`, `DropdownMenu`, `Sonner` in `components/ui`.
3. Folder skeleton exactly as in frontend.md (`app/`, `api/`, `config/`, `components/{ui,layout,feedback}`, `features/`, `pages/`, `hooks/`, `stores/`, `lib/`, `routes/`, `testing/`), with `config/env.ts` validating `VITE_*` and `app/provider.tsx` holding every provider. Visual tokens from [design/ui.md](../design/ui.md#visual-tokens-proposed-d-24) in `src/index.css` (`@theme`).
4. `lib/query-client.ts` (TanStack Query 5) and `routes/router.tsx` (React Router 7 data mode: `createBrowserRouter` from `react-router`) with placeholder pages for `/`, `/login`, `/register`, and a `NotFound` page.
5. `api/client.ts`: an axios instance with `baseURL = VITE_API_URL` and `withCredentials: true`, plus a typed helper that unwraps `{ data }` and converts the canonical error into an `ApiError`. The auth interceptor comes later (AUTH-003).
6. `components/feedback/ErrorBoundary.tsx` and the Sonner `Toaster` mounted once at the root.
7. `.env.example` with `VITE_API_URL`, `VITE_SOCKET_URL`.

# Out of Scope
Auth pages and logic (AUTH-*), any feature UI.

# Frontend Changes
New `Trello-Clone-FE/` package as described.

# Backend Changes
None.

# Database Changes
None.

# API Changes
None.

# Realtime Changes
None.

# Security Considerations
Only `VITE_*` variables reach the bundle; none are secret.

# Testing
Vitest + Testing Library + MSW set up; one test that renders the router at `/` and at an unknown path (NotFound).

# Acceptance Criteria
- [ ] `pnpm --filter @trello-clone/web dev` shows the placeholder home page.
- [ ] `build`, `lint`, `typecheck`, `test` pass.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
FOUNDATION-001.

# Risks
shadcn/ui generator versions change → commit the generated components; do not regenerate in later tasks without reason.
