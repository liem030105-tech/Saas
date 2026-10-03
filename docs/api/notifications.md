# API – Notifications

> **Domain:** `notifications` module (NOTIFICATIONS-001, [ADR-021](../decisions/README.md#adr-021-in-app-notifications-only-d-09)): in-app only, per user. Conventions, errors, validation, permission matrix: [README](README.md). Data model: [schema.md → Notification](../database/schema.md#notification--notifications-001). Live updates: [realtime.md](../architecture/realtime.md).

**Shared shapes**
- `NotificationType = 'CARD_ASSIGNED' | 'CARD_COMMENTED' | 'CARD_MENTIONED' | 'CARD_DUE_SOON' | 'WORKSPACE_INVITED'`
- `NotificationDto = { id, type, read, createdAt, actor: UserSummary | null, workspace: { id, name, slug }, board: { id, title } | null, card: { id, title, dueDate } | null, comment: { id, excerpt } | null, invite: { id, role } | null }`
  - `actor` is who caused it (`null` for `CARD_DUE_SOON`). `UserSummary` as in [cards.md](cards.md).
  - Names and titles are read when the list is read (current values, not copies), so a renamed card shows its new title.
  - `comment.excerpt`: the comment's first 140 characters, raw markdown (the FE shows it as plain text).
  - Which fields are set, per type: see [Triggers](#triggers).

---

## Who sees a notification
A notification belongs to one user (the recipient) and is never shown to anyone else; another user's notification id is a `404`, like an unknown one.

It is shown only while the recipient can still reach what it points to, **checked on every read** (task spec → Security):
- Every type except `WORKSPACE_INVITED`: the recipient may still see what it points to, by the same rule as its routes: `board.view` on the notification's board (`assertBoardAccess`) for card types. Board access is workspace membership today (every member sees every board of the workspace), so the check is one membership lookup; if boards ever get their own access rules, this check follows them, so titles and excerpts never leak. A removed member stops seeing that workspace's notifications at once (they are not deleted, so rejoining shows them again).
- `WORKSPACE_INVITED`: the invite is still pending (not accepted, not expired) and still addressed to the recipient's email.
- What it points to was deleted: the row goes with it (foreign keys cascade from the card, board, workspace, comment or invite), so it never points to nothing.

The unread count follows the same rule.

## Triggers
Each notification is written in the same transaction as the change that causes it, and sent live after the commit (`notification:created`, [realtime.md](../architecture/realtime.md)). Nobody is notified about their own action.

| Type | When | Recipients | Set fields |
|------|------|-----------|------------|
| `CARD_ASSIGNED` | `POST /cards/:cardId/members/:userId` adds a member (not a repeated assign) | the assigned user, unless they assigned themselves | actor, workspace, board, card |
| `CARD_COMMENTED` | `POST /cards/:cardId/comments` | the card's members except the author, and except anyone this comment mentions (they get `CARD_MENTIONED` instead) | actor, workspace, board, card, comment |
| `CARD_MENTIONED` | `POST /cards/:cardId/comments` whose content mentions a workspace member: `@[Name](mention:<userId>)`, inserted by the composer's `@` picker (D-28); ids that are not workspace members are ignored | each mentioned workspace member except the author; an edit adds no notification | actor, workspace, board, card, comment |
| `CARD_DUE_SOON` | a card the recipient is a member of is due within 24 hours (D-29), not completed, not archived; see below | each card member | workspace, board, card |
| `WORKSPACE_INVITED` | `POST /workspaces/:workspaceId/invites` for an email that belongs to an existing account | that account | actor, workspace, invite |

**Due soon, without a job runner** (ADR-021: no schedulers or queues): due-soon notifications are created when the recipient asks for notifications (`GET /notifications` and `GET /notifications/unread-count`). Before answering, the server adds the missing ones for the caller's cards that are due within 24 hours, at most one per card and due date (a unique key; a changed due date can notify again). This is bounded: only cards the caller is a member of, in workspaces they still belong to, not completed or archived, with `dueDate` between now and now + 24 hours. It is idempotent and race-safe: one insert that skips rows already there (`createMany` with `skipDuplicates` on the `(userId, dedupeKey)` unique), so two tabs asking at once create each row once. They are therefore not sent live; the FE refetches the count on load, on focus, on reconnect and every 15 minutes, so they show up within that time while the app is open.

**Re-invites:** re-inviting the same email replaces the invite row (workspaces.md), so its notification goes with it and the new invite brings a new one.

---

### GET /notifications
| | |
|--|--|
| Task | NOTIFICATIONS-001 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | Own notifications only |
| Query | The [pagination convention](README.md#pagination) (`limit` per D-14; `cursor` is the id of the last notification of the previous page), and `unread?` = `true` \| `false` (default): unread ones only |
| Success | `200 { data: NotificationDto[], nextCursor: string \| null }`, newest first (`createdAt DESC, id DESC`); only those the caller may see now (above) |
| Errors | `400` (invalid query, or a cursor that is not one of the caller's visible notifications) · `401` · `429 RATE_LIMITED` |

### GET /notifications/unread-count
| | |
|--|--|
| Task | NOTIFICATIONS-001 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | Own notifications only |
| Success | `200 { data: { count: number } }`: visible unread notifications (due-soon ones added first, see Triggers) |
| Errors | `401` · `429 RATE_LIMITED` |

### PATCH /notifications/:notificationId
| | |
|--|--|
| Task | NOTIFICATIONS-001 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | The recipient |
| Body | `{ read: boolean }` |
| Success | `200 { data: NotificationDto }`; idempotent. Sends `notification:read` to the recipient's other tabs |
| Errors | `400` · `401` · `404` (unknown, malformed, someone else's, or not visible now) · `429 RATE_LIMITED` |

### POST /notifications/read-all
| | |
|--|--|
| Task | NOTIFICATIONS-001 |
| Authentication | Bearer · rate limited per user (D-04) |
| Authorization | Own notifications only |
| Body | none |
| Success | `204`: every notification of the caller created up to now is read. Sends `notification:read` with `all: true` |
| Errors | `401` · `429 RATE_LIMITED` |

### POST /invites/:inviteId/accept
Accepting an invite from its notification (the raw invite token is never stored, so the notification cannot carry the link). Specified in [workspaces.md](workspaces.md#post-invitesinviteidaccept); it marks the invite's notification read.

There is no delete: notifications stay until what they point to is deleted. Retention beyond that is out of scope.

Schemas (to add in `@trello-clone/shared`): `NOTIFICATION_TYPES`, `NotificationDtoSchema`, `ListNotificationsQuerySchema`, `UpdateNotificationInputSchema`, `UnreadCountSchema`.

## Frontend
- A bell in the top bar with the unread count (`99+` above 99; hidden at 0), named for screen readers ("Notifications, 3 unread").
- It opens a popover: newest first, unread ones marked, "Load more" for older ones, "Mark all as read". Empty state: "You're all caught up."
- An entry reads like the activity feed ("Ada assigned you to Fix login", "Ada commented on Fix login: …", "Ada mentioned you on Fix login", "Fix login is due tomorrow", "Ada invited you to Acme as a Member").
- Clicking an entry marks it read and opens the card (`/b/:boardId/c/:cardId`). An invite entry has "Accept" (then opens the workspace) instead.
- Query keys `['notifications']` and `['notifications', 'unread-count']`, in a new `features/notifications`.

## Required tests
- **Each endpoint:** happy path, validation, `401`, and someone else's notification (`404`). The endpoints are per user, so there is no role case.
- **Suites:** register every new endpoint in `tests/integration/tenant-isolation.test.ts` (its coverage test walks the whole app, so `/notifications` is in its filter). That includes `POST /invites/:inviteId/accept`: an invite of another workspace or another email → `404`. The role-matrix harness covers workspace-scoped routes with a role check; these routes have none (they are the caller's own data, like `POST /invites/accept`), so instead the endpoint tests show that each role (OWNER to VIEWER) sees its workspace's notifications and that a removed member no longer does.
- **Each trigger:**
  - who is notified and who is not (the actor, non-members of the card, a repeated assign);
  - comment vs. mention precedence;
  - due-soon created once per card and due date, never for completed, archived or past cards;
  - an invite to an existing vs. an unknown email.
- **Visibility re-checked on read:**
  - a removed member stops seeing the workspace's notifications, and the unread count drops;
  - an expired or accepted invite disappears;
  - cascades when the card, comment or workspace is deleted.
- **Live:** `notification:created` reaches only the recipient's sockets, and `notification:read` reaches the recipient's other tabs.
