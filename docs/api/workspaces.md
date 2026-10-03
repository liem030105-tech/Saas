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
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ VIEWER |
| Success | `200 { data: WorkspaceDto }` |
| Errors | `401` · `404` · `429 RATE_LIMITED` |

The FE resolves `/w/:slug` by finding the slug in the `GET /workspaces` result. No slug lookup endpoint is needed. A malformed id answers `404` like an unknown one.

### PATCH /workspaces/:workspaceId
| | |
|--|--|
| Task | WORKSPACE-002 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ ADMIN |
| Body | `{ name?, slug? }`, at least one |
| Success | `200 { data: WorkspaceDto }` |
| Errors | `400` · `401` · `403` · `404` · `409 CONFLICT` (slug taken) · `429 RATE_LIMITED` |

**Behavior:** the body is validated before the role check (the standard route order), so an invalid body is `400` for anyone. The slug follows the slug rule ([README → Validation rules](README.md#validation-rules)); the unique index decides conflicts. The old slug is not kept as an alias. Schema: `UpdateWorkspaceInputSchema` (`@trello-clone/shared`).

### DELETE /workspaces/:workspaceId
| | |
|--|--|
| Task | WORKSPACE-002 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | OWNER |
| Success | `204`. Cascades to members, invitations, and all boards and content ([relationships.md](../database/relationships.md#foreign-keys-and-delete-behavior)); every attachment file is deleted from storage after commit (ATTACHMENTS-001) |
| Errors | `401` · `403` · `404` · `429 RATE_LIMITED` |

## Members

### GET /workspaces/:workspaceId/members
| | |
|--|--|
| Task | WORKSPACE-003 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ VIEWER |
| Success | `200 { data: MemberDto[] }` ordered by role (OWNER first), then name (case-insensitive) |
| Errors | `401` · `404` · `429 RATE_LIMITED` |

### PATCH /workspaces/:workspaceId/members/:userId
| | |
|--|--|
| Task | WORKSPACE-003 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ ADMIN, subject to footnotes 1–3 of the [permission matrix](README.md#permission-matrix) |
| Body | `{ role }` |
| Success | `200 { data: MemberDto }` (unchanged when the role is the same) |
| Errors | `400` · `401` · `403` (ADMIN acting on an OWNER, or granting OWNER) · `404` (workspace or member not found) · `422` rule `LAST_OWNER` · `429 RATE_LIMITED` |

### DELETE /workspaces/:workspaceId/members/:userId
| | |
|--|--|
| Task | WORKSPACE-003 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ ADMIN (subject to footnotes), **or** `userId` = caller (leave, any role) |
| Success | `204`. Also removes the user's `CardMember` rows in this workspace (I3, since CARD-005b; after the membership row, so a concurrent assignment is either removed or refused) and revokes nothing else |
| Errors | `401` · `403` · `404` · `422` rule `LAST_OWNER` · `429 RATE_LIMITED` |

**Behavior (PATCH and DELETE):** each runs in one transaction that first locks the workspace row (`SELECT … FOR NO KEY UPDATE`), so member changes in a workspace run one at a time, then re-reads the caller's role and counts the OWNERs. Two OWNERs demoting or removing each other at the same time therefore always leave one OWNER (I4), and an OWNER demoted at the same moment cannot still grant OWNER. A `422` body is `details: [{ rule: "LAST_OWNER", message }]`; rule names are `BUSINESS_RULES` in `@trello-clone/shared`. Schemas: `ChangeMemberRoleInputSchema`, `MemberDtoSchema`.

## Invitations

Invite link format: `<CLIENT_URL>/invite/<token>`. The raw token (256 random bits, base64url) is returned **once** on creation, inside `inviteUrl`; the database keeps only its sha256, and it is never logged. Until email delivery exists (D-18), the inviter copies and shares the link manually. Links expire after 7 days (D-17, proposed default).

### GET /workspaces/:workspaceId/invites
| | |
|--|--|
| Task | WORKSPACE-004 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ ADMIN |
| Success | `200 { data: InviteDto[] }`: pending (not accepted, not expired) only, newest first. Never a token or its hash |
| Errors | `401` · `403` · `404` · `429 RATE_LIMITED` |

### POST /workspaces/:workspaceId/invites
| | |
|--|--|
| Task | WORKSPACE-004 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ ADMIN; invite `role` ≤ caller's role and never `OWNER` (I5: the schema rejects it with `400`) |
| Body | `{ email, role }` (email trimmed and lower-cased) |
| Success | `201 { data: InviteDto & { inviteUrl: string } }`. Any earlier invite for the same email in this workspace (pending, expired, or accepted) is replaced: new token, new expiry, and the old link stops working. An existing account with that email is notified in the app (`WORKSPACE_INVITED`, [notifications.md](notifications.md#triggers)); a replaced invite's notification goes with it |
| Errors | `400` · `401` · `403` · `404` · `409 CONFLICT` (email already belongs to a member, or a concurrent invite for it won) · `402 PLAN_LIMIT_REACHED` (members plus pending invites would go over the plan's limit; a replaced invite does not count, [billing.md](billing.md#plans-and-limits)) · `429 RATE_LIMITED` |

### DELETE /workspaces/:workspaceId/invites/:inviteId
| | |
|--|--|
| Task | WORKSPACE-004 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | ≥ ADMIN |
| Success | `204`; the link stops working |
| Errors | `401` · `403` · `404` (unknown, already accepted, or another workspace's invite) · `429 RATE_LIMITED` |

### POST /invites/accept
| | |
|--|--|
| Task | WORKSPACE-004 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | Caller's email must equal the invite email (both stored lower-cased) |
| Body | `{ token }` |
| Success | `200 { data: WorkspaceDto }` (with the caller's new role). The invite is marked accepted only if still pending and the membership is created with the invite role, in one transaction, so a link works once |
| Errors | `400` · `401` · `404` (unknown, expired, or already-accepted token, or email mismatch; identical bodies on purpose) · `409 CONFLICT` (already a member; the invite stays pending) · `402 PLAN_LIMIT_REACHED` (the workspace is at its plan's member limit without this invite, e.g. after a downgrade; the invite stays pending, [billing.md](billing.md#plans-and-limits)) · `429 RATE_LIMITED` |

### POST /invites/:inviteId/accept
| | |
|--|--|
| Task | NOTIFICATIONS-001 (accepting from a `WORKSPACE_INVITED` notification, [notifications.md](notifications.md)) |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | Caller's email must equal the invite email, as for the token |
| Body | none |
| Success | `200 { data: WorkspaceDto }`; the same rules and transaction as `POST /invites/accept`, and the invite's notification is marked read. Safe without the token: only the addressee, signed in with that email, can accept it, which is what the token proves too |
| Errors | `401` · `404` (unknown, malformed, expired, or already-accepted invite, or email mismatch; identical bodies) · `409 CONFLICT` (already a member; the invite stays pending) · `402 PLAN_LIMIT_REACHED` (as for the token) · `429 RATE_LIMITED` |

Schemas: `CreateInviteInputSchema`, `InviteDtoSchema`, `CreatedInviteDtoSchema`, `AcceptInviteInputSchema` (`@trello-clone/shared`).

## Required tests
- The full role matrix for each route (OWNER / ADMIN / MEMBER / VIEWER / non-member → 404).
- `LAST_OWNER` on demote, remove, and leave. An ADMIN cannot change an OWNER or grant OWNER.
- Invites: expired, email mismatch, accept twice, re-invite replaces the token, the invite role is capped by the caller's role. Accepting by id (NOTIFICATIONS-001): the same cases.
- Removing a member deletes their card assignments in that workspace only.
