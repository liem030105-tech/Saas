---
description: Review the current diff or a branch against the project's rules
argument-hint: [base branch or PR – defaults to main]
---

Base to compare against: $ARGUMENTS (use `main` if empty).

Review the changes in `git diff <base>...HEAD` plus any uncommitted changes.

Use the `code-review` skill. Do not modify files unless the user asks for fixes.

1. List the changed files grouped by BE / shared / FE / DB / docs / other.
2. Check each item of the `code-review` checklist, in priority order.
3. Run `pnpm typecheck && pnpm lint && pnpm test` and include the results.
4. Output findings as `severity · file:line · problem · fix`, then a verdict: **ready to merge** or **changes needed**.
