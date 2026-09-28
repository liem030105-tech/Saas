# Definition of Done

> **Domain:** the **single canonical** Definition of Done. [`plan.md`](../../plan.md), [`testing.md`](testing.md), and [`TASK-TEMPLATE.md`](../tasks/TASK-TEMPLATE.md) link here instead of restating it.
> A task spec may add task-specific criteria; it never removes baseline items.

## Baseline (every task)

| # | Criterion | How it is checked |
|---|-----------|-------------------|
| 1 | **Architecture boundary** – code lives in the owning folder (FE / BE / shared); no FE ↔ BE imports; shared has no business logic; no cross-module internals | Review against `.claude/CLAUDE.md` §3 |
| 2 | **Backend authorization** – every new or changed endpoint checks role per the [permission matrix](../api/README.md#permission-matrix) | Integration tests (403 case) |
| 3 | **Tenant isolation** – non-members get `404`; client-supplied foreign keys are resolved inside the same workspace | Integration tests (non-member case) |
| 4 | **Validation** – all input validated with Zod per the [validation rules](../api/README.md#validation-rules); errors use the canonical format | Integration tests (400 case) |
| 5 | **Tests** – written per the [test requirements matrix](testing.md#when-each-test-type-is-required) | `pnpm test` |
| 6 | **Typecheck** passes | `pnpm typecheck` |
| 7 | **Lint** passes, no warnings introduced | `pnpm lint` |
| 8 | **Documentation** – API, schema, architecture, and setup docs updated when their subject changed; task status updated in [`docs/tasks/README.md`](../tasks/README.md) | Review |
| 9 | **No secrets** – nothing sensitive in code, fixtures, logs, or the FE bundle; `.env` untouched | Review |
| 10 | **No unrelated changes** – no refactors, renames, or dependency bumps outside the task scope; new dependencies justified in the PR | Review of `git diff` |
| 11 | **Database** – schema changes come with a new migration; merged migrations untouched | Review |
| 12 | **CI green** on the PR; PR description lists what changed, why, and how it was tested | GitHub |

Items 2–4 and 11 apply only when the task touches the backend or the database; mark them *n/a* otherwise.

## Phase-level Done
A phase is done when all its tasks are done **and** the phase acceptance in [`plan.md`](../../plan.md#7-roadmap) holds on `main`.
