---
paths:
  - "Trello-Clone-BE/src/**"
  - "Trello-Clone-BE/tests/**"
---

# Backend (Trello-Clone-BE) rules

Loaded automatically when Claude reads matching files. Procedures, references, and checklists: the `backend` skill.

- A new module has `<m>.routes.ts`, `<m>.controller.ts`, `<m>.service.ts`, `<m>.test.ts`. Add `<m>.repository.ts` **only** when backend.md's criteria are met.
- Controller: take validated input → call service → `res.status(x).json({ data })`. No Prisma, no `try/catch` that swallows errors.
- Service: throw `AppError` with codes from `@trello-clone/shared`. Never touch `req`/`res`.
- Every non-public route: `authenticate` → `apiRateLimit` → `validate(schema)` → authorization (`requireWorkspaceRole` or `assertBoardAccess` in the service).
- Non-member → `NOT_FOUND`; member without the role → `FORBIDDEN`.
- Client-supplied foreign keys (listId, labelId, userId) must belong to the same board/workspace.
- Multi-record changes use `prisma.$transaction`; log `Activity` in the same transaction; emit realtime **after commit** via `realtime/events/*`.
- Creating plan-limited resources calls `billing.service.assertWithinLimit` first.
- Request/response Zod schemas come from `@trello-clone/shared`; BE-only schemas (e.g. params) live in `<m>.schema.ts`.
