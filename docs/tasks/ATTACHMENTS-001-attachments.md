# ATTACHMENTS-001: Attachments and card covers

| Field | Value |
|-------|-------|
| Phase | 6 (Post-MVP) |
| Depends on | REALTIME-001 |
| Blocked by decisions | **D-20** (storage provider); D-10, D-19 have defaults |
| Skills | backend, database, frontend |

# Goal
Members attach files to cards and can set an image attachment as the card cover.

# Context
Specs: [attachments](../api/cards.md#attachments-post-mvp-attachments-001), [Attachment model](../database/schema.md#attachment--attachments-001), [security → uploads](../architecture/security.md#file-uploads-attachments-001).

# Requirements
1. Model `Attachment`; `ActivityType` += `ATTACHMENT_ADDED`; migration `add_attachments`.
2. Upload (Multer memory → provider; magic-byte MIME check; size limit per plan D-10 – until BILLING-001, use the Free value for all), list in `CardDetailDto`, delete (uploader or ADMIN+); file deletion after commit, including the cascades from card/list/board/workspace deletion.
3. `PATCH /cards/:cardId` accepts `coverUrl` (must be the URL of an image attachment of the same card, or `null`).
4. Emit `card:updated` after attachment changes.
5. FE: attachment section in the modal (upload with progress, list, delete, "make cover"); covers on card items.

# Out of Scope
Image resizing/thumbnails; per-plan limits beyond size (BILLING-001).

# Frontend Changes
`features/cards/components/AttachmentsSection.tsx`, cover rendering in `CardItem`.

# Backend Changes
`modules/cards/attachments.*`, `lib/storage.ts` (provider adapter per D-20).

# Database Changes
Model `Attachment`; migration `add_attachments`.

# API Changes
`POST /api/v1/cards/:cardId/attachments`, `DELETE /api/v1/attachments/:attachmentId`, `coverUrl` in `PATCH /api/v1/cards/:cardId`.

# Realtime Changes
`card:updated` on attachment add/remove/cover change.

# Security Considerations
MIME allowlist by magic bytes, size limits, sanitized names, UUID keys, no server-disk writes, storage credentials only in env.

# Testing
Integration with a stubbed storage adapter: 413, 415 (a renamed .exe), delete permissions, cascade cleanup calls, cover validation.

# Acceptance Criteria
- [ ] A member uploads a PNG, sets it as the cover, and another member sees the cover appear live.

# Definition of Done
- [ ] [Baseline Definition of Done](../development/definition-of-done.md) satisfied
- [ ] Status set to **Done** in [docs/tasks/README.md](README.md) (the only place task status is tracked)

# Dependencies
REALTIME-001 (emits); decision D-20.

# Risks
Orphaned files on failures → the post-commit deletion is retried and logged; a cleanup job stays out of scope.
