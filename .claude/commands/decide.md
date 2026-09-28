---
description: Record the user's answer to an open decision (D-xx) and update every doc that depends on it
argument-hint: <D-xx> [the chosen option, if already known]
---

Decision to record: $ARGUMENTS

Decisions belong to the user (CLAUDE.md §7: never state an unconfirmed value as decided).

1. Read the `D-xx` item in `docs/decisions/DECISIONS-REQUIRED.md`, including its options, recommendation, and "Affects" list.
2. If `$ARGUMENTS` does not already contain the user's choice, present the question, the options, and the recommendation, then ask the user to choose. Stop until they answer.
3. With the user's answer:
   - If the choice changes architecture or scope, append a new ADR to `docs/decisions/README.md` (Context → Decision → Rationale → Trade-offs → Status). A value-only choice (a limit, a lifetime) needs no ADR.
   - Mark the item **Resolved** in DECISIONS-REQUIRED.md with the chosen value and a link to the ADR if one was written.
   - Update every doc in its "Affects" list: replace "proposed default (D-xx)" wording with the decided value, and remove "blocked by D-xx" from task specs and from the table in `docs/tasks/README.md`.
4. Grep the repo for `D-xx` and confirm no remaining mention still describes it as open.
5. Summarize what changed. This is a docs-only change: commit it as `docs: resolve D-xx (<short choice>)`.
