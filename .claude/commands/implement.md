---
description: Implement an approved plan or small change following the project workflow
argument-hint: <feature, plan reference, or change description>
---

Implement: $ARGUMENTS

Follow `.claude/CLAUDE.md` (rules in section 9, workflow in section 10) and load the matching skills.

1. If no approved plan exists for this change and it touches more than one module, run the `/plan` steps first and confirm with the user.
2. Inspect the relevant module(s) before editing.
3. Implement in order: **BE → shared schemas/types (if needed) → FE**. Stay within the modules named in the plan; no unrelated refactors or new dependencies without justification.
4. DB change? Update `schema.prisma` and create a migration (`database` skill).
5. Add/update tests to meet `docs/development/testing.md` (`testing` skill).
6. Run, in order, and fix any failure before continuing:
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test`
7. Update docs affected by the change (`docs/api`, `docs/architecture`, `docs/database`, ADR).
8. Review your own diff against the `code-review` skill checklist.
9. Summarize: what changed (by module), tests added, docs updated, commands run and their results, follow-ups.

Stop and ask if the work would cross folder ownership boundaries or change architecture beyond the plan.
