---
description: Produce an implementation plan for a feature or change without writing code
argument-hint: <feature or change description>
---

Create an implementation plan for: $ARGUMENTS

Do **not** modify any files. Follow workflow steps 1–4 in `.claude/CLAUDE.md`:

1. Restate the requirement and list open questions. If anything is ambiguous, ask before planning further.
2. Read the relevant docs (the task spec in `docs/tasks/` if one exists, `plan.md` phase, `docs/architecture/*`, `docs/api/<module>.md`, `docs/database/*`).
3. Inspect the affected code and list the modules touched, grouped as **BE / shared / FE / DB / docs**. Call out anything outside those modules and why it is needed.
4. Output the plan:
   - Goal and non-goals
   - Ordered steps (BE → shared → FE → tests → docs), each naming the files to create/modify
   - DB changes and migration name, if any
   - API changes (routes, schemas, error codes, authorization)
   - Realtime events, if any
   - Tests required (per `docs/development/testing.md`)
   - Docs to update
   - Risks, trade-offs, and anything that needs a new ADR
   - Which skills apply (`backend`, `frontend`, `database`, `realtime`, `testing`)

Keep the plan small enough for one PR; if it is not, split it into sequential PRs.
