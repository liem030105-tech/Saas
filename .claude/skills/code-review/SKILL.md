---
name: code-review
description: Use when reviewing a diff, branch, or pull request in this repository before committing or merging – checking architecture boundaries, authorization, tenant isolation, tests, docs, and scope creep.
---

# Skill: Code Review

## Purpose
Catch problems before merge using this project's specific rules, not just general style.
This skill is **read-only** by default: it reports findings. It changes code only when the user asks for fixes.

## Read first
1. `.claude/CLAUDE.md` (sections 3–9)
2. The diff (`git diff main...HEAD`) and the docs for every touched module

## Review checklist (in priority order)
1. **Security & tenancy** – every new query/route checks membership; non-member → 404, role → 403; client-supplied foreign keys validated; no secrets; input validated with Zod; markdown sanitized.
2. **Correctness** – transactions around multi-record changes; realtime emitted after commit; position/rebalance logic; error codes match `docs/api`.
3. **Boundaries** – no FE ↔ BE imports; shared contains no business logic; no cross-module internal imports; controllers don't call Prisma; no server state in Zustand.
4. **Scope** – no unrelated refactors or modules touched; no unjustified new dependency; no new infrastructure without an ADR.
5. **Database** – schema change has a migration; merged migrations untouched; indexes for new queries.
6. **Tests** – [test matrix](../../../docs/development/testing.md) met; new endpoints registered in the role-matrix and tenant-isolation suites; no `.skip`/`.only`; tests assert behavior.
7. **Task fit** – when implementing a task spec: every Requirement and Acceptance Criterion met, nothing from Out of Scope included, task status updated.
8. **Docs** – `docs/api`, `docs/architecture`, `docs/database`, ADRs updated where required.
9. **Conventions** – naming, no `any`, no `console.log`, Conventional Commit messages.

## Output format
For each finding: severity (**blocker** / **should-fix** / **nit**), `file:line`, the problem, and a concrete fix. End with a verdict: *ready to merge* or *changes needed*.

## May modify
- Nothing unless the user asks for fixes; then only lines tied to reported findings.

## Must never modify
- Unrelated code under the banner of "cleanup"
