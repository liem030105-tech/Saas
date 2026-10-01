# Frontend Architecture

> **Domain:** structure and rules of `Trello-Clone-FE` (`@trello-clone/web`). What screens look like and how they behave: [design/ui.md](../design/ui.md).

## Stack
Versions: [plan.md §3](../../plan.md#3-tech-stack) (ADR-015). Version-specific rules that differ from older tutorials:
- **React Router 7 in data mode:** `createBrowserRouter` + `RouterProvider`, imported from `react-router` (not `react-router-dom`, not framework mode).
- **Tailwind CSS 4:** configured in CSS (`@import "tailwindcss"`, `@theme`) with the `@tailwindcss/vite` plugin; there is no `tailwind.config.js`.
- **shadcn/ui:** toasts use **Sonner**; the old `Toast` component is deprecated.
- **Zod 4** API (e.g. `z.email()`), shared with the BE through `@trello-clone/shared`.

## Structure (feature-based)

```
Trello-Clone-FE/
├── src/
│   ├── app/                 # provider.tsx (QueryClient, Router, Toaster, ErrorBoundary), App.tsx
│   ├── api/                 # axios instance, refresh-token interceptor, apiClient
│   ├── config/              # env.ts: import.meta.env validated with Zod (VITE_* only)
│   ├── components/
│   │   ├── ui/              # shadcn/ui components + shared primitives (Button, Dialog, Input, Markdown)
│   │   ├── layout/          # AppLayout, Sidebar, Header
│   │   ├── feedback/        # Spinner, ErrorBoundary, EmptyState, Toaster, ConfirmDialog
│   │   └── forms/           # EditableTitle (rename in place, boards and lists)
│   ├── features/
│   │   ├── auth/
│   │   ├── workspaces/
│   │   ├── boards/
│   │   ├── lists/
│   │   ├── cards/
│   │   ├── comments/
│   │   └── billing/
│   ├── pages/               # route-level components that compose features; no logic
│   ├── hooks/               # generic, domain-agnostic hooks (useDebounce, useMediaQuery)
│   ├── stores/              # global Zustand stores for UI state (theme, sidebar)
│   ├── lib/                 # socket client, queryClient, cn(), date formatting
│   ├── routes/              # router definition, ProtectedRoute, lazy loading
│   ├── testing/             # mocks/ (MSW handlers + server), render.tsx (renderWithProviders, renderApp)
│   │   └── data/            # test data and builders, one file per area; tests never inline it
│   └── main.tsx
├── public/
├── tests/                   # Playwright E2E + shared test setup
├── package.json
└── vite.config.ts
```

### Inside a feature
```
features/cards/
├── api.ts            # API calls (apiClient + schemas from shared)
├── queries.ts        # useCardQuery, useMoveCardMutation, … + query key factory
├── components/       # CardItem, CardDetailModal, ChecklistSection
├── hooks/            # hooks used only by this feature
├── store.ts          # (optional) feature-local UI state
└── index.ts          # the feature's public API
```

## What belongs where

| Folder | Contains | Does NOT contain |
|--------|----------|------------------|
| `components/` | **Domain-agnostic** UI reusable anywhere | Anything named after a domain ("Card", "Board") or that calls the API |
| `features/` | Everything for one domain: API calls, queries, components, hooks | Imports of another feature's internals (only via its `index.ts`) |
| `hooks/` | Generic hooks not tied to a domain | Hooks that call the API (those belong to a feature) |
| `stores/` | Global UI state (theme, sidebar open, active filters) | **Server data** (boards, cards, users) |
| `lib/` | Library setup, pure utilities | React components |
| `pages/` | Route-bound components composing features | Business logic, direct API calls |
| `routes/` | Router config, route guards, lazy imports | UI |
| `app/` | Providers and the root component | Feature logic |
| `config/` | Validated public env (`VITE_*`) | Secrets (never in the FE) |
| `testing/` | Test-only helpers, MSW mocks, and test data (`testing/data/`) | Production code imports |

**Import direction** (enforced in `eslint.config.js` by `import-x/no-restricted-paths` and `no-restricted-imports`, FOUNDATION-001): `components`, `hooks`, `lib`, `config`, `stores` → never import `features`, `pages`, `routes`, or `app`; features never import `pages`, `routes`, or `app`; a feature imports another feature only through its `index.ts` (`@/features/<name>`); `pages` compose features; `app` imports everything.

## State management
- **Server state must use TanStack Query.** Query keys: `['boards', workspaceId, { archived }]` (prefix `['boards', workspaceId]` invalidates both lists), `['board', boardId]`, `['card', cardId]`; each feature exposes a key factory in `queries.ts`.
- **Zustand is for UI state only** (open modal, filters, theme). Never copy server data into Zustand.
- **Forms:** React Hook Form + `zodResolver` with schemas from `@trello-clone/shared`.

## Drag and drop with optimistic updates
Lists (LIST-003): `features/lists/components/SortableLists.tsx` (the `DndContext` for the list row) and `features/lists/hooks/useMoveList.ts`. A move is given as its new neighbours; one board's list and card adds and moves share a mutation scope (`boardMutationScope` and `refetchBoardWhenIdle` in `features/boards`), so they run in turn and each computes its position when its request starts. The final positions arrive with the board refetch after the last pending one (a rebalance renumbers every list, and the board is refetched right away when one happened). Cards (CARD-004) share that `DndContext`: `features/cards/components/SortableCards.tsx` makes each list's cards a sortable group whose area is also a drop target (so an empty list accepts a card), `features/cards/hooks/useCardDrag.ts` keeps a local preview of the lists while a card is dragged across them (the Query cache is untouched until the drop, so a refetch cannot move the card under the pointer), and `features/cards/hooks/useMoveCard.ts` sends the move the same way as `useMoveList`. `data.type` (`list`, `card`, `card-list`; `features/cards/dnd.ts`) keeps lists and cards from colliding with each other, for the pointer and for the keyboard (↑/↓ within a list, ←/→ to the next list). Position math for both lives in `lib/positions.ts`.

1. `onDragEnd` computes the new `position` with `positionBetween(prev, next)` from `@trello-clone/shared` (never a local copy).
2. `onMutate`: cancel in-flight queries, snapshot the cache, update the cache.
3. Call `PATCH /cards/:id/move`; on error restore the snapshot in `onError`; `onSettled` invalidates.

## Auth on the FE
- Access token is kept **in memory** (inside `api/`), never in localStorage.
- Interceptor: on 401, call `/auth/refresh` exactly once (concurrent failures share one promise), then retry. If the refresh returns 401, the query cache is cleared and the user goes to `/login?redirectTo=…`.
- Session restore: the root route's loader (`restoreSession`, `features/auth/session.ts`) calls `/auth/refresh` once before any page renders; a 401 means signed out, any other failure shows the error page with a reload button.
- `routes/ProtectedRoute.tsx` wraps signed-in pages: without an access token (after the restore) it redirects to `/login?redirectTo=<page>`; otherwise it renders `AppLayout` (header with the user's avatar menu) around the page.
- Logout: avatar menu → Log out (`useLogout`); order and details in `.claude/skills/frontend/references/auth-client.md` → Logout. After a deliberate logout, `ProtectedRoute` sends visitors to a plain `/login` (no `redirectTo`).
- Hiding buttons by role is **UX only**; real authorization is always enforced by the backend. Components ask `can(role, action)` (`features/workspaces/permissions.ts`, a copy of the permission matrix tested against the same fixture as the BE map); `useWorkspaceRole(workspaceId)` gives the caller's role from the cached workspace list.

## Routes
| Route | Page |
|-------|------|
| `/` | Signed in: redirect to the first workspace, or the "Create your first workspace" screen when the user has none (WORKSPACE-001, ADR-019). Signed out: landing page (BILLING-001, pending D-08) |
| `/pricing` | Pricing (BILLING-001, pending D-08) |
| `/invite/:token` | Accept invitation (WORKSPACE-004) |
| `/login`, `/register` | Auth |
| `/w/:slug`, `/w/:slug/members`, `/w/:slug/settings` | Workspace. Resolved from the cached `GET /workspaces` list by `WorkspaceGate` (`features/workspaces`), which also follows slug changes and redirects to `/` when the workspace is gone ([ui.md](../design/ui.md#workspace-settings-wslugsettings)) |
| `/b/:boardId`, `/b/:boardId/c/:cardId` | Board, card modal |
| `/settings/profile` | Profile |
