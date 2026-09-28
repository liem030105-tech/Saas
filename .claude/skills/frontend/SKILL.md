---
name: frontend
description: Use when creating or modifying frontend code in Trello-Clone-FE/src – React components, pages, routes, feature modules, TanStack Query hooks, Zustand stores, forms, drag and drop, or styling with Tailwind/shadcn/ui.
---

# Skill: Frontend (Trello-Clone-FE)

## Purpose
Keep FE code feature-based, keep server state in TanStack Query, and keep the UI consistent with the API contract.
This skill adds detail to CLAUDE.md; it never overrides it.

## Read first
1. `docs/architecture/frontend.md` – folder responsibilities, state rules
2. `docs/api/<module>.md` – the endpoints the feature calls
3. The target feature folder `src/features/<x>/` and its `index.ts`

## Rules
- Domain code goes in `features/<x>/` (`api.ts`, `queries.ts`, `components/`, `hooks/`). `components/` holds only domain-agnostic UI.
- Import other features only through their `index.ts`.
- **Server data → TanStack Query** with a key factory in `queries.ts`. **Zustand → UI state only.** Never copy server data into a store.
- Mutations that affect the board use optimistic updates: `onMutate` snapshot → `onError` rollback → `onSettled` invalidate.
- Forms: React Hook Form + `zodResolver` with schemas from `@trello-clone/shared`; never redefine API types by hand.
- API calls go through `src/api` `apiClient` only; never create a new axios instance.
- Role-based UI hiding is UX only; never treat it as security.
- Render markdown only through the sanitized markdown component; never `dangerouslySetInnerHTML`.
- Handle loading, empty, and error states for every query.
- Accessibility: interactive elements are real buttons/links with labels; drag and drop keeps @dnd-kit keyboard sensors.

## May modify
- `Trello-Clone-FE/**` (except `.env`)
- `packages/shared/**` only when a schema is genuinely missing (coordinate with the BE; prefer the `backend` skill to drive contract changes)

## Must never modify
- `Trello-Clone-BE/**`
- `.env*` except `.env.example`
- Put secrets or non-`VITE_` config into the FE bundle

## Done checklist
- [ ] Components/hooks with logic have tests (Vitest + Testing Library + MSW)
- [ ] No server data in Zustand; query keys come from a factory
- [ ] Loading/empty/error states handled
- [ ] `pnpm --filter @trello-clone/web typecheck`, `lint`, `test` pass
