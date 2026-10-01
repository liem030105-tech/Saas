# <AREA>-<NNN>: <Short imperative title>

| Field                | Value                                                |
| -------------------- | ---------------------------------------------------- |
| Phase                | <0–9> (MVP / Post-MVP)                               |
| Depends on           | <task IDs>                                           |
| Blocked by decisions | <D-xx or "none">                                     |
| Skills               | <backend / frontend / database / realtime / testing> |

# Goal

One or two sentences: the user-visible or developer-visible outcome.

# Context

Why this task exists and where it sits in the roadmap. Link the specs it implements (`docs/api/…`, `docs/database/…`, `docs/architecture/…`). **Do not copy the specs; link them.**

# Requirements

Numbered, testable statements. Every statement must be traceable to a spec or a decision.

# Out of Scope

What this task must **not** do (prevents scope creep; later tasks that own it).

# Frontend Changes

Files/folders under `Trello-Clone-FE/src` to add or change, or "None".

# Backend Changes

Modules/files under `Trello-Clone-BE/src` to add or change, or "None".

# Database Changes

Models, fields, indexes, enums, and the migration name (per [schema.md](../database/schema.md) "Introduced in"), or "None".

# API Changes

Endpoints (method + path) with links to their spec, or "None".

# Realtime Changes

Events/rooms (Post-MVP only), or "None".

# Security Considerations

Authentication, authorization (permission matrix rows), tenant isolation, validation, and secret handling relevant to this task.

# Testing

Tests to write, per the [test requirements matrix](../development/testing.md#when-each-test-type-is-required).

# Acceptance Criteria

Concrete, verifiable checks (Given/When/Then or checklist).

# Definition of Done

- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Task-specific items (if any)
- [ ] Status updated in [docs/tasks/README.md](README.md)

# Dependencies

Task IDs that must be Done first, and why.

# Risks

Known risks and mitigations.
