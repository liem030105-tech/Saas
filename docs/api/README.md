# API – Conventions, Errors, Authorization

> **Domain:** cross-cutting REST rules: naming, response/error format, pagination, validation, **authorization model**, tenant isolation.
> Modules: [authentication](authentication.md) · [workspaces](workspaces.md) · [boards](boards.md) · [lists](lists.md) · [cards](cards.md) · [billing](billing.md)
>
> Once code exists, the **Zod schemas in `packages/shared/src/schemas`** are the source of truth for shapes; these docs define behavior, authorization, and errors.

## Conventions
- Base path `/api/v1`. JSON UTF-8. Timestamps ISO 8601 UTC. IDs are `cuid` strings.
- Authentication header `Authorization: Bearer <accessToken>` unless an endpoint is marked **Public**.
- camelCase fields.
- **Naming:** plural nouns and kebab-case (`/workspaces/:workspaceId/members`). Nest at most one level under the parent that scopes creation or listing (`POST /boards/:boardId/lists`). Operate on an existing resource by its own id (`PATCH /lists/:listId`). Actions that are not plain field updates use a verb sub-resource (`PATCH /cards/:cardId/move`, `POST /invites/accept`).
- Path parameter names are `:<resource>Id` (`:workspaceId`, `:boardId`, `:listId`, `:cardId`, `:userId`, `:labelId`, `:checklistId`, `:itemId`, `:commentId`, `:inviteId`, `:attachmentId`).
- `PATCH` bodies are partial; at least one field is required (otherwise `400`).
- Breaking changes go to `/api/v2`; `v1` is never changed silently.

## Response format
Single resource:
```json
{ "data": { "id": "clx…", "title": "Sprint 1" } }
```
List (not paginated):
```json
{ "data": [ … ] }
```
Paginated list:
```json
{ "data": [ … ], "nextCursor": "clx…" }
```
`204 No Content` has no body.

## Canonical error format
Every error response, without exception:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary",
    "details": [ { "path": "title", "message": "Required" } ],
    "requestId": "b3f1…"
  }
}
```
- `code`: a value from the table below (defined once in `packages/shared/src/constants/error-codes.ts`).
- `details`: always an array (empty when not applicable). For validation errors it has one entry per failing field path.
- `requestId`: echoes the `X-Request-Id` response header, for log correlation.

| HTTP | `code` | When |
|------|--------|------|
| 400 | `VALIDATION_ERROR` | Body, params, or query fail the schema |
| 401 | `UNAUTHORIZED` | Missing, invalid, or expired access/refresh token |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password (same message for both) |
| 401 | `TOKEN_REUSED` | A revoked refresh token was presented; its family is now revoked |
| 402 | `PLAN_LIMIT_REACHED` | Plan limit exceeded (from BILLING-001, see D-11) |
| 403 | `FORBIDDEN` | Caller is a workspace member but lacks the required role or ownership |
| 404 | `NOT_FOUND` | Resource does not exist **or** caller is not a member of its workspace |
| 409 | `CONFLICT` | Unique conflict (email, slug, existing member/invite) |
| 413 | `FILE_TOO_LARGE` | Upload exceeds the limit |
| 415 | `UNSUPPORTED_FILE_TYPE` | Upload MIME type not allowed |
| 422 | `BUSINESS_RULE_VIOLATION` | Valid input that breaks a rule (last OWNER, cross-board label, …); `details[0].rule` names the rule |
| 429 | `RATE_LIMITED` | Too many requests; `Retry-After` header set |
| 500 | `INTERNAL_ERROR` | Unexpected error; no internals exposed |

## Pagination
- **Strategy:** cursor-based, ordered by `(createdAt DESC, id DESC)` unless stated otherwise.
- **Query:** `?limit=<n>&cursor=<id>`. `limit` defaults to 20, max 100 (proposed defaults, D-14). `cursor` is the `id` of the last item from the previous page.
- **Response:** `nextCursor` is `null` when there are no more items. An invalid cursor returns `400`.
- **Paginated endpoints:** `GET /boards/:boardId/activities`, `GET /cards/:cardId/comments`. All other lists are bounded by the parent resource and returned whole.

## Validation rules
Shared rules applied through Zod. The length limits are proposed defaults (D-15).

| Field | Rule |
|-------|------|
| Any `…Id` param/body field | cuid string |
| `email` | trimmed, lower-cased, valid email, ≤ 254 chars |
| `password` | 8–72 chars (bcrypt limit) |
| User `name` | trimmed, 1–100 chars |
| `avatarUrl` | `https` URL, ≤ 2048 chars, or `null` |
| Workspace `name` | trimmed, 1–100 chars |
| Workspace `slug` | `^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$` (3–50 chars) |
| Board / List / Checklist `title` | trimmed, 1–100 chars |
| Card `title` | trimmed, 1–200 chars |
| Card `description` | ≤ 10 000 chars, or `null` |
| Comment `content` | trimmed, 1–5 000 chars |
| ChecklistItem `content` | trimmed, 1–500 chars |
| Label `name` | trimmed, 0–50 chars |
| Colour (`background`, label `color`) | `^#[0-9a-fA-F]{6}$` |
| `dueDate` | ISO 8601 datetime or `null` |
| `position` | finite number `> 0` |
| `role` in requests | `ADMIN` \| `MEMBER` \| `VIEWER` (invites); `OWNER` \| `ADMIN` \| `MEMBER` \| `VIEWER` (role change, subject to rules below) |

Unknown body fields are stripped, not rejected.

---

## Authorization model

**The backend is the only security boundary.** The FE may hide or disable actions for UX (from the caller's `role` returned by `GET /workspaces`), but every endpoint re-checks on the server.

### Roles
Roles are per workspace and apply to **every board in that workspace**. There is no per-board membership.

| Role | Intent |
|------|--------|
| OWNER | Full control, including billing, deletion, and granting OWNER |
| ADMIN | Manages members, invitations, and boards; cannot touch OWNERs or billing |
| MEMBER | Creates and edits content (boards, lists, cards, comments) |
| VIEWER | Read-only |

### Permission matrix
✅ allowed · ❌ denied (`403`) · "own" = only resources the caller created.

| Resource / action | OWNER | ADMIN | MEMBER | VIEWER |
|-------------------|:-----:|:-----:|:------:|:------:|
| **Workspace** – view, list members | ✅ | ✅ | ✅ | ✅ |
| Workspace – rename / change slug | ✅ | ✅ | ❌ | ❌ |
| Workspace – delete | ✅ | ❌ | ❌ | ❌ |
| Workspace – leave | ✅¹ | ✅ | ✅ | ✅ |
| **Members** – change role | ✅² | ✅³ | ❌ | ❌ |
| Members – remove | ✅¹ | ✅³ | ❌ | ❌ |
| **Invitations** – create, list, revoke | ✅ | ✅⁴ | ❌ | ❌ |
| Invitations – accept | the invited email's user, any role |
| **Board** – view, view activity | ✅ | ✅ | ✅ | ✅ |
| Board – create, rename, recolour, archive/unarchive | ✅ | ✅ | ✅ | ❌ |
| Board – delete permanently | ✅ | ✅ | ❌ | ❌ |
| **Label** – create, edit, delete | ✅ | ✅ | ✅ | ❌ |
| **List** – create, rename, reorder, archive, delete | ✅ | ✅ | ✅ | ❌ |
| **Card** – view | ✅ | ✅ | ✅ | ✅ |
| Card – create, edit, move, archive, delete | ✅ | ✅ | ✅ | ❌ |
| Card – assign members, attach labels, checklists | ✅ | ✅ | ✅ | ❌ |
| **Comments** – view | ✅ | ✅ | ✅ | ✅ |
| Comments – create | ✅ | ✅ | ✅ | ❌ |
| Comments – edit | own | own | own | ❌⁵ |
| Comments – delete | any | any | own | ❌⁵ |
| **Attachments** (Phase 6) – upload | ✅ | ✅ | ✅ | ❌ |
| Attachments – delete | any | any | own | ❌ |
| **Billing** (Phase 7) – view | ✅ | ✅ | ❌ | ❌ |
| Billing – checkout / portal | ✅ | ❌ | ❌ | ❌ |

1. The last OWNER cannot leave, be removed, or be demoted (`422`, rule `LAST_OWNER`).
2. Only an OWNER can grant `OWNER`.
3. An ADMIN can act only on targets whose current role is ≤ ADMIN, and can assign at most `ADMIN`. Acting on an OWNER returns `403`.
4. An ADMIN can invite with role ≤ ADMIN. Invites never grant `OWNER` (I5).
5. A VIEWER cannot edit or delete even their own earlier comments (e.g. after being demoted).

### Tenant isolation rules
1. Every request touching workspace data resolves the workspace from the **stored** resource, never from a client-supplied `workspaceId` (e.g. `PATCH /cards/:cardId` → card → `boardId` → `workspaceId`).
2. Membership and role are checked in the same query that loads the resource. Shared helpers live in the `workspaces` module (`assertWorkspaceAccess`) and the `boards` module (`assertBoardAccess`).
3. Non-member **or** non-existent → `404 NOT_FOUND`. Member with an insufficient role → `403 FORBIDDEN`. Existence is never leaked.
4. Every client-supplied foreign key (`listId` in a move, `labelId`, `userId` to assign) must resolve inside the **same workspace** (and the same board for labels). If the caller cannot see it → `404`. If it is visible but violates a rule → `422`.
5. List endpoints only ever return rows scoped by the caller's memberships.
6. Realtime rooms apply the same checks on join (see [realtime.md](../architecture/realtime.md#connection-and-authorization)).
7. Every endpoint's integration tests include a **non-member → 404** case (see [testing.md](../development/testing.md)).
