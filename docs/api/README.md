# API – Common Conventions

> **Domain:** REST conventions, response/error format, error codes. Per-module docs:
> [authentication](authentication.md) · [workspaces](workspaces.md) · [boards](boards.md) · [lists](lists.md) · [cards](cards.md) · [billing](billing.md)
>
> Once code exists, the **Zod schemas in `packages/shared/src/schemas`** are the source of truth for request/response shapes. These docs describe behavior, authorization, and error codes.

## Conventions
- Base URL `/api/v1`. JSON UTF-8. Timestamps are ISO 8601 UTC. IDs are `cuid`.
- Auth header `Authorization: Bearer <accessToken>` unless a route is marked **Public**.
- camelCase fields. Nest at most one level (`/boards/:id/lists`); operate on child resources by their own id (`/lists/:id`).
- Cursor pagination: `?limit=20&cursor=<id>` → `{ data, nextCursor }`.
- Breaking changes → `/api/v2`; never silently change `v1`.

## Response format
Success:
```json
{ "data": { ... } }
```
Paginated list:
```json
{ "data": [ ... ], "nextCursor": "clx..." | null }
```
Error:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Title is required", "details": [ { "path": "title", "message": "Required" } ], "requestId": "..." } }
```

## Status codes and error codes

| HTTP | `code` | When |
|------|--------|------|
| 400 | `VALIDATION_ERROR` | Body/params/query fail the schema |
| 401 | `UNAUTHORIZED` | Missing, invalid, or expired token |
| 401 | `INVALID_CREDENTIALS` | Wrong email/password |
| 401 | `TOKEN_REUSED` | A revoked refresh token was reused |
| 402 | `PLAN_LIMIT_REACHED` | Free plan limit exceeded |
| 403 | `FORBIDDEN` | Member without the required role |
| 404 | `NOT_FOUND` | Does not exist **or** caller is not a member (no existence leak) |
| 409 | `CONFLICT` | Duplicate (email, slug, already a member) |
| 413 | `FILE_TOO_LARGE` | File exceeds the limit |
| 415 | `UNSUPPORTED_FILE_TYPE` | MIME type not allowed |
| 422 | `BUSINESS_RULE_VIOLATION` | Business rule broken (e.g. removing the last OWNER) |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected error |

Error codes are defined once in `packages/shared/src/constants/error-codes.ts`.

## Endpoint template (used in every API doc)

```
### METHOD /path
- Authorization: Public | Authenticated | Role ≥ MEMBER …
- Request: schema name in shared (e.g. CreateBoardInput) + example
- Response: status + schema name (e.g. BoardDto)
- Service: <module>.service.<fn> – what it does; transaction/event/activity?
- Errors: possible codes
- Tests: required cases
```

## Role matrix (reference)

| Action | OWNER | ADMIN | MEMBER | VIEWER |
|--------|:-----:|:-----:|:------:|:------:|
| View workspace/board/card | ✅ | ✅ | ✅ | ✅ |
| Create/edit boards, lists, cards, comments | ✅ | ✅ | ✅ | ❌ |
| Delete boards | ✅ | ✅ | ❌ | ❌ |
| Invite/remove members, change roles (≤ own role) | ✅ | ✅ | ❌ | ❌ |
| Billing, delete workspace, transfer ownership | ✅ | ❌ | ❌ | ❌ |

Comments: authors may edit/delete their own; ADMIN and above may delete any comment.
