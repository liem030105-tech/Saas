---
description: Implement a task spec (or a small approved change) following the project workflow
argument-hint: <TASK-ID, e.g. AUTH-001> | <small change description>
---

Implement: $ARGUMENTS

Follow `.claude/CLAUDE.md` (rules in section 9, workflow in section 10) and load the matching skills.

1. **If `$ARGUMENTS` is a task ID:** read `docs/tasks/<TASK-ID>-*.md` and every doc it links. Check `docs/tasks/README.md`: all dependencies must be Done. Check `docs/decisions/DECISIONS-REQUIRED.md`: no blocking decision may be open for this task. If either check fails, stop and report.
   **Otherwise:** if the change touches more than one module, run the `/plan` steps first and confirm with the user.
2. Inspect the relevant module(s) before editing.
3. Implement only the task's Requirements, in order: **BE → shared schemas/types (if needed) → FE**. Respect "Out of Scope"; no unrelated refactors or new dependencies without justification.
4. DB change? Update `schema.prisma` and create the migration named in the task (`database` skill).
5. Add/update tests per the task's Testing section and `docs/development/testing.md` (`testing` skill).
6. Run, in order, and fix any failure before continuing:
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test`
7. Update the docs affected by the change, and set the task status to Done in `docs/tasks/README.md`.
8. For AUTH-*, WORKSPACE-*, and BILLING-* tasks, also run the built-in `/security-review` and fix what it finds. Have the `code-reviewer` subagent review the diff against `main` (pass the task ID). Fix every blocker and should-fix it reports, re-run step 6, and repeat until it returns **ready to merge**.
9. Summarize: what changed (by module), tests added, docs updated, commands run and their results, and any acceptance criterion not met.

Stop and ask if the work would cross folder ownership boundaries, contradict a spec, or require a decision that is not recorded.
