# Task Specifications

> **Domain:** the implementation backlog. Each task is one PR-sized unit that a Claude Code session can implement from its spec alone.
> Template: [TASK-TEMPLATE.md](TASK-TEMPLATE.md) · Baseline acceptance: [Definition of Done](../development/definition-of-done.md) · Open decisions: [DECISIONS-REQUIRED](../decisions/DECISIONS-REQUIRED.md)

## How to use
1. Pick the **first task in the implementation order below whose status is Todo** and whose dependencies are all Done.
2. Check its "Blocked by decisions" field; a blocking `D-xx` must be resolved first.
3. Run `/implement <TASK-ID>`; the task spec plus linked docs are the full requirements.
4. When merged, set the status to **Done** in the table below (in the same PR). This table is the only place task status is tracked; spec files carry no status.

## Dependency graph

```
FOUNDATION-001 ─┬─▶ FOUNDATION-002 ─┬─▶ FOUNDATION-004 ─┐
                └─▶ FOUNDATION-003 ─┤                    ├─▶ FOUNDATION-006
                                    └─▶ FOUNDATION-005 ──┘
                                              │
                                              ▼
AUTH-001 ─▶ AUTH-002 ─┬─▶ AUTH-003 ─▶ AUTH-004 ─┐
                      └─▶ AUTH-005 ─────────────┴─▶ AUTH-006
                                │
                                ▼
WORKSPACE-001 ─┬─▶ WORKSPACE-002 ─────────────┐
               └─▶ WORKSPACE-003 ─▶ WORKSPACE-004 ─┴─▶ WORKSPACE-005 ─▶ WORKSPACE-006
                                                                  │
                                                                  ▼
BOARD-001 ─▶ BOARD-002 ─▶ LIST-001 ─┬─▶ LIST-002
                                    ├─▶ LIST-003 ──────────┐
                                    └─▶ CARD-001 ─▶ CARD-002 ─┬─▶ CARD-003 ─▶ CARD-004
                                                              └─▶ CARD-005
                                                                    │  (MVP complete: all Phase 0–4 tasks Done)
                                                                    ▼
                                                              REALTIME-001
                                              ┌───────────────┬─────┴────────┬──────────────────┐
                                              ▼               ▼              ▼                  ▼
                                      ATTACHMENTS-001    SEARCH-001   NOTIFICATIONS-001    BILLING-001
                                              └───────────────┴──────┬───────┴──────────────────┘
                                                                     ▼
                                                               TESTING-001 ─▶ DEPLOYMENT-001
```
CARD-003 also depends on LIST-003 (shared rebalance helper).

## Implementation order (deterministic) and status

| # | Task | Phase | Depends on | Can run in parallel with | Blocked by | Status |
|---|------|-------|------------|--------------------------|------------|--------|
| 1 | [FOUNDATION-001](FOUNDATION-001-repository-setup.md) repository setup | 0 | – | – | – | Done |
| 2 | [FOUNDATION-002](FOUNDATION-002-backend-bootstrap.md) backend bootstrap | 0 | F-001 | F-003 | – | Todo |
| 3 | [FOUNDATION-003](FOUNDATION-003-frontend-bootstrap.md) frontend bootstrap | 0 | F-001 | F-002 | – | Todo |
| 4 | [FOUNDATION-004](FOUNDATION-004-database-bootstrap.md) database bootstrap | 0 | F-002 | F-005 | – | Todo |
| 5 | [FOUNDATION-005](FOUNDATION-005-shared-package.md) shared package | 0 | F-002, F-003 | F-004 | – | Todo |
| 6 | [FOUNDATION-006](FOUNDATION-006-ci-quality-gates.md) CI quality gates | 0 | F-004, F-005 | – | – | Todo |
| 7 | [AUTH-001](AUTH-001-register.md) register | 1 | F-006 | – | – | Todo |
| 8 | [AUTH-002](AUTH-002-login.md) login | 1 | AUTH-001 | – | – | Todo |
| 9 | [AUTH-003](AUTH-003-refresh-token.md) refresh token | 1 | AUTH-002 | AUTH-005 | – | Todo |
| 10 | [AUTH-004](AUTH-004-logout.md) logout | 1 | AUTH-003 | AUTH-005 | – | Todo |
| 11 | [AUTH-005](AUTH-005-current-user.md) current user & profile | 1 | AUTH-002 | AUTH-003, AUTH-004 | D-07 (optional part only) | Todo |
| 12 | [AUTH-006](AUTH-006-auth-e2e.md) auth E2E | 1 | AUTH-004, AUTH-005 | WORKSPACE-001 | – | Todo |
| 13 | [WORKSPACE-001](WORKSPACE-001-create-workspace.md) create/list workspaces | 2 | AUTH-005 | AUTH-006 | D-06 (register hook only) | Todo |
| 14 | [WORKSPACE-002](WORKSPACE-002-workspace-crud.md) workspace CRUD | 2 | W-001 | W-003 | – | Todo |
| 15 | [WORKSPACE-003](WORKSPACE-003-members.md) members | 2 | W-001 | W-002 | – | Todo |
| 16 | [WORKSPACE-004](WORKSPACE-004-invitations.md) invitations | 2 | W-003 | W-002 | – | Todo |
| 17 | [WORKSPACE-005](WORKSPACE-005-rbac.md) RBAC consolidation | 2 | W-002, W-004 | – | – | Todo |
| 18 | [WORKSPACE-006](WORKSPACE-006-tenant-isolation.md) tenant isolation suite | 2 | W-005 | BOARD-001 | – | Todo |
| 19 | [BOARD-001](BOARD-001-create-board.md) create/list boards | 3 | W-005 | W-006 | – | Todo |
| 20 | [BOARD-002](BOARD-002-board-crud.md) board detail/update/delete | 3 | B-001, W-006 | – | – | Todo |
| 21 | [LIST-001](LIST-001-create-list.md) create list | 3 | B-002 | – | – | Todo |
| 22 | [LIST-002](LIST-002-list-crud.md) list update/delete | 3 | L-001 | L-003, C-001 | – | Todo |
| 23 | [LIST-003](LIST-003-list-ordering.md) list ordering + rebalance | 3 | L-001 | L-002, C-001 | – | Todo |
| 24 | [CARD-001](CARD-001-create-card.md) create card | 3 | L-001 | L-002, L-003 | – | Todo |
| 25 | [CARD-002](CARD-002-card-crud.md) card detail/update/delete | 3 | C-001 | L-003 | – | Todo |
| 26 | [CARD-003](CARD-003-card-move.md) card move API | 3 | C-002, L-003 | C-005 | – | Todo |
| 27 | [CARD-004](CARD-004-card-drag-drop.md) card drag and drop | 3 | C-003 | C-005 | – | Todo |
| 28 | [CARD-005](CARD-005-card-details.md) card details | 4 | C-002 | C-003, C-004 | – | Todo |
| 29 | [REALTIME-001](REALTIME-001-realtime.md) realtime | 5 | all MVP tasks | – | – | Todo |
| 30 | [ATTACHMENTS-001](ATTACHMENTS-001-attachments.md) attachments | 6 | REALTIME-001 | SEARCH, NOTIFICATIONS, BILLING | **D-20** | Todo |
| 31 | [SEARCH-001](SEARCH-001-search-filters.md) search & filters | 6 | REALTIME-001 | ATTACHMENTS, NOTIFICATIONS, BILLING | – | Todo |
| 32 | [NOTIFICATIONS-001](NOTIFICATIONS-001-notifications.md) notifications | 6 | REALTIME-001 | ATTACHMENTS, SEARCH, BILLING | **D-09** | Todo |
| 33 | [BILLING-001](BILLING-001-billing.md) billing & plan limits | 7 | REALTIME-001 | ATTACHMENTS, SEARCH, NOTIFICATIONS | **D-13** | Todo |
| 34 | [TESTING-001](TESTING-001-testing-hardening.md) testing hardening | 8 | Phases 5–7 | – | – | Todo |
| 35 | [DEPLOYMENT-001](DEPLOYMENT-001-production-deployment.md) production deployment | 9 | TESTING-001 | – | **D-21, D-22** | Todo |

"Can run in parallel" means no code dependency; with a single developer, still follow the numeric order unless deliberately parallelizing in separate branches.

## Notes on task boundaries
- **Activity log:** the model and write helper arrive in BOARD-001 and are used from then on. The feed endpoint and UI arrive in CARD-005.
- **Plan limits:** not enforced in MVP tasks. BILLING-001 adds them (D-11).
- **Realtime:** MVP tasks never emit. REALTIME-001 adds emits to existing services.
- **CARD-005** is large; it may be delivered as sub-PRs (labels → members → checklists → comments → activity feed), each meeting the DoD.
