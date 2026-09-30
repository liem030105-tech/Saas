# API – Workspaces, Members, Invitations

> **Domain:** `workspaces` module. Conventions, errors, validation, permission matrix: [README](README.md).

**Shared shapes**
- `WorkspaceDto = { id, name, slug, plan, createdAt, role }`. `role` is the **caller's** role; the FE uses it only for UI.
- `MemberDto = { user: { id, name, email, avatarUrl }, role, joinedAt }`
- `InviteDto = { id, email, role, expiresAt, createdAt, invitedBy: { id, name } }`

---

## Workspaces

### GET /workspaces
| | |
|--|--|
| Task | WORKSPACE-001 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | Any authenticated user; returns only the caller's workspaces |
| Success | `200 { data: WorkspaceDto[] }`, ordered by name (case-insensitive) |
| Errors | `401` · `429 RATE_LIMITED` |

### POST /workspaces
| | |
|--|--|
| Task | WORKSPACE-001 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | Any authenticated user |
| Body | `{ name }` |
| Success | `201 { data: WorkspaceDto }` (caller becomes OWNER; slug is generated from the name, with a random suffix on collision) |
| Errors | `400` · `401` · `429 RATE_LIMITED` |

**Behavior:** the workspace and the caller's OWNER membership are created in one transaction. Slug: the name in kebab-case, ASCII only (accents dropped), at most 45 chars; `workspace` when nothing usable is left; a random 4-char suffix (`acme-team-x9k2`) when it is taken or shorter than 3 chars. The unique index decides collisions, including concurrent ones, and each retry uses a new suffix. `slug` and `plan` in the body are ignored. Schemas: `CreateWorkspaceInputSchema`, `WorkspaceDtoSchema` (`@trello-clone/shared`).

### GET /workspaces/:workspaceId
| | |
|--|--|
| Task | WORKSPACE-002 |
| Authorization | ≥ VIEWER |
| Success | `200 { data: WorkspaceDto }` |
| Errors | `401` · `404` |

The FE resolves `/w/:slug` by finding the slug in the `GET /workspaces` result. No slug lookup endpoint is needed.

### PATCH /workspaces/:workspaceId
| | |
|--|--|
| Task | WORKSPACE-002 |
| Authorization | ≥ ADMIN |
| Body | `{ name?, slug? }` |
| Success | `200 { data: WorkspaceDto }` |
| Errors | `400` · `401` · `403` · `404` · `409 CONFLICT` (slug taken) |

### DELETE /workspaces/:workspaceId
| | |
|--|--|
| Task | WORKSPACE-002 |
| Authorization | OWNER |
| Success | `204`. Cascades to all boards and content ([relationships.md](../database/relationships.md#foreign-keys-and-delete-behavior)) |
| Errors | `401` · `403` · `404` |

## Members

### GET /workspaces/:workspaceId/members
| | |
|--|--|
| Task | WORKSPACE-003 |
| Authorization | ≥ VIEWER |
| Success | `200 { data: MemberDto[] }` ordered by role, then name |

### PATCH /workspaces/:workspaceId/members/:userId
| | |
|--|--|
| Task | WORKSPACE-003 |
| Authorization | ≥ ADMIN, subject to footnotes 1–3 of the [permission matrix](README.md#permission-matrix) |
| Body | `{ role }` |
| Success | `200 { data: MemberDto }` |
| Errors | `400` · `403` (ADMIN acting on an OWNER, or granting OWNER) · `404` (workspace or member not found) · `422` rule `LAST_OWNER` |

### DELETE /workspaces/:workspaceId/members/:userId
| | |
|--|--|
| Task | WORKSPACE-003 |
| Authorization | ≥ ADMIN (subject to footnotes), **or** `userId` = caller (leave) |
| Success | `204`. Also removes the user's `CardMember` rows in this workspace (I3) and revokes nothing else |
| Errors | `403` · `404` · `422` rule `LAST_OWNER` |

## Invitations

Invite link format: `<CLIENT_URL>/invite/<token>`. The raw token is returned **once** on creation. Until email delivery exists (D-18), the inviter copies and shares the link manually.

### GET /workspaces/:workspaceId/invites
| | |
|--|--|
| Task | WORKSPACE-004 |
| Authorization | ≥ ADMIN |
| Success | `200 { data: InviteDto[] }`: pending (not accepted, not expired) only |

### POST /workspaces/:workspaceId/invites
| | |
|--|--|
| Task | WORKSPACE-004 |
| Authorization | ≥ ADMIN; invite `role` ≤ caller's role and never `OWNER` |
| Body | `{ email, role }` |
| Success | `201 { data: InviteDto & { inviteUrl: string } }`. A pending invite for the same email is replaced (new token, new expiry) |
| Errors | `400` · `403` · `404` · `409 CONFLICT` (email already belongs to a member) · `402` (from BILLING-001 only, D-11) |

### DELETE /workspaces/:workspaceId/invites/:inviteId
| | |
|--|--|
| Task | WORKSPACE-004 |
| Authorization | ≥ ADMIN |
| Success | `204` |
| Errors | `403` · `404` |

### POST /invites/accept
| | |
|--|--|
| Task | WORKSPACE-004 |
| Authentication | Bearer |
| Authorization | Caller's email must equal the invite email (case-insensitive) |
| Body | `{ token }` |
| Success | `200 { data: WorkspaceDto }`. Membership is created with the invite role and `acceptedAt` set, in one transaction |
| Errors | `404` (unknown, expired, or already-accepted token, or email mismatch; indistinguishable on purpose) · `409 CONFLICT` (already a member) |

## Required tests
- The full role matrix for each route (OWNER / ADMIN / MEMBER / VIEWER / non-member → 404).
- `LAST_OWNER` on demote, remove, and leave. An ADMIN cannot change an OWNER or grant OWNER.
- Invites: expired, email mismatch, accept twice, re-invite replaces the token, the invite role is capped by the caller's role.
- Removing a member deletes their card assignments in that workspace only.
