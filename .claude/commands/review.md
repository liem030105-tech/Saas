---
description: Review the current diff or a branch against the project's rules
argument-hint: [base branch or PR – defaults to main]
---

Base to compare against: $ARGUMENTS (use `main` if empty).

Review the changes in `git diff <base>...HEAD` plus any uncommitted changes.

Do not modify files unless the user asks for fixes.

1. Delegate the checklist review to the `code-reviewer` subagent (`.claude/agents/code-reviewer.md`) with the base ref, so it reviews in a fresh context. It applies the `code-review` skill.
2. Meanwhile run `pnpm typecheck && pnpm lint && pnpm test` and include the results.
3. Output the subagent's findings (`severity · file:line · problem · fix`) plus any command failures, then a verdict: **ready to merge** or **changes needed**.
