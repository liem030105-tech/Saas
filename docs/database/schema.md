# Database Schema

> **Domain:** the complete data model, entity by entity.
> For every model already in `Trello-Clone-BE/prisma/schema.prisma`, that file is the source of truth and this file keeps explanations and the changelog; models not yet there are still specified here ([migration log](#migration-log)).
> Relations, cascades, invariants, ordering: [relationships.md](relationships.md) · Access rules: [architecture/database.md](../architecture/database.md).

## Conventions

- **IDs:** `String @id @default(cuid())` unless the table uses a composite key.
- **Timestamps:**
  - `createdAt DateTime @default(now())` on every entity a user creates.
  - `updatedAt DateTime @updatedAt` on every entity that can be edited and is synced in realtime. It serves as the realtime `version`.
  - Join tables and append-only tables (Activity) have no `updatedAt`.
- **Nullability:** a field is nullable only when "no value" is a valid state (e.g. `dueDate`).
- **Soft delete:** `archived Boolean @default(false)` on Board, List, Card. Everything else is hard-deleted.
- **Ordering:** `position Float` on List, Card, Checklist, ChecklistItem (see [relationships.md → Ordering](relationships.md#ordering-position)).
- **Introduced in:** the task that first creates the model or field, so the Prisma schema grows incrementally ([task list](../tasks/README.md)).

## Enums

| Enum | Values | Introduced in |
|------|--------|---------------|
| `Role` | `OWNER`, `ADMIN`, `MEMBER`, `VIEWER` | WORKSPACE-001 |
| `Plan` | `FREE`, `PRO` | WORKSPACE-001 (column only; used from BILLING-001) |
| `ActivityType` | `BOARD_CREATED`, `BOARD_UPDATED`, `LIST_CREATED`, `LIST_UPDATED`, `LIST_MOVED`, `LIST_ARCHIVED`, `CARD_CREATED`, `CARD_UPDATED`, `CARD_MOVED`, `CARD_ARCHIVED`, `MEMBER_ADDED`, `MEMBER_REMOVED`, `COMMENT_ADDED`, `LABEL_ADDED`, `LABEL_REMOVED`, `CHECKLIST_ADDED`, `CHECKLIST_REMOVED`, `CHECKLIST_ITEM_CHECKED`, `ATTACHMENT_ADDED` | BOARD-001; values added by the task that first logs them |
| `NotificationType` | `CARD_ASSIGNED`, `CARD_COMMENTED`, `CARD_MENTIONED`, `CARD_DUE_SOON`, `WORKSPACE_INVITED` | NOTIFICATIONS-001 |
| `SubscriptionStatus` | `ACTIVE`, `TRIALING`, `PAST_DUE`, `CANCELED`, `INCOMPLETE` (mirror of Stripe statuses we act on) | BILLING-001 |

Role order for comparisons: `OWNER > ADMIN > MEMBER > VIEWER`.

## Tenant boundary per entity

| Entity | Path to its workspace |
|--------|-----------------------|
| Workspace | itself |
| WorkspaceMember, WorkspaceInvite, Board, Subscription, Notification | `workspaceId` (a Notification also belongs to one user, its recipient) |
| List, Label, Activity | `boardId → Board.workspaceId` |
| Card | `boardId → Board.workspaceId` (denormalized `boardId`, see below) |
| CardMember, CardLabel, Checklist, Comment, Attachment | `cardId → Card.boardId → Board.workspaceId` |
| ChecklistItem | `checklistId → Checklist.cardId → …` |
| User, RefreshToken | not tenant-scoped (global identity) |
| StripeEvent | not tenant-scoped (only Stripe's event ids) |

---

## Entities

Column key: **N** = nullable · **Key** = PK / FK / UQ (unique) / IX (indexed).

### User — FOUNDATION-004 (table), AUTH-001 (used)
| Field | Type | N | Default | Key | Notes |
|-------|------|---|---------|-----|-------|
| id | String | | cuid | PK | |
| email | String | | | UQ | Stored lower-cased |
| passwordHash | String | | | | bcrypt |
| name | String | | | | |
| avatarUrl | String | ✓ | | | URL only; uploads are out of scope |
| createdAt / updatedAt | DateTime | | now / auto | | |

### RefreshToken — AUTH-001
| Field | Type | N | Default | Key | Notes |
|-------|------|---|---------|-----|-------|
| id | String | | cuid | PK | |
| userId | String | | | FK → User (Cascade), IX | |
| tokenHash | String | | | UQ | `sha256(token)`; the raw token is never stored |
| familyId | String | | | IX | Groups one login's rotations, **required for reuse detection** |
| expiresAt | DateTime | | | | |
| revokedAt | DateTime | ✓ | | | Set when rotated, logged out, or family revoked |
| replacedById | String | ✓ | | | Next token in the rotation chain (audit/debug) |
| createdAt | DateTime | | now | | |

### Workspace — WORKSPACE-001
| Field | Type | N | Default | Key | Notes |
|-------|------|---|---------|-----|-------|
| id | String | | cuid | PK | |
| name | String | | | | |
| slug | String | | | UQ | URL `/w/:slug`; generated from the name with a random suffix on collision |
| plan | Plan | | FREE | | Changed only by billing webhooks (BILLING-001) |
| createdAt / updatedAt | DateTime | | | | |

### WorkspaceMember — WORKSPACE-001
| Field | Type | N | Default | Key | Notes |
|-------|------|---|---------|-----|-------|
| userId | String | | | PK(userId, workspaceId), FK → User (Cascade), IX | IX serves "my workspaces" |
| workspaceId | String | | | PK, FK → Workspace (Cascade), IX | |
| role | Role | | MEMBER | | |
| joinedAt | DateTime | | now | | Shown on the members page |

### WorkspaceInvite — WORKSPACE-004
| Field | Type | N | Default | Key | Notes |
|-------|------|---|---------|-----|-------|
| id | String | | cuid | PK | |
| workspaceId | String | | | FK → Workspace (Cascade) | |
| email | String | | | UQ(workspaceId, email) | One pending invite per email per workspace |
| role | Role | | MEMBER | | Never `OWNER` (validation) |
| tokenHash | String | | | UQ | `sha256(token)` |
| invitedById | String | | | FK → User (Cascade) | Indexed (the FK cascades on user delete) |
| expiresAt | DateTime | | | | Now + D-17 |
| acceptedAt | DateTime | ✓ | | | Accepted invites are kept for audit; re-inviting deletes the old row |
| createdAt | DateTime | | now | | |

### Board — BOARD-001
| Field | Type | N | Default | Key | Notes |
|-------|------|---|---------|-----|-------|
| id | String | | cuid | PK | |
| workspaceId | String | | | FK → Workspace (Cascade), IX(workspaceId, archived) | |
| title | String | | | | |
| background | String | | `#0079bf` | | Hex colour |
| archived | Boolean | | false | | |
| createdAt / updatedAt | DateTime | | | | |

### List — LIST-001
| Field | Type | N | Default | Key | Notes |
|-------|------|---|---------|-----|-------|
| id | String | | cuid | PK | |
| boardId | String | | | FK → Board (Cascade), IX(boardId, position) | |
| title | String | | | | |
| position | Float | | | | |
| archived | Boolean | | false | | |
| createdAt / updatedAt | DateTime | | | | |

### Card — CARD-001
| Field | Type | N | Default | Key | Notes |
|-------|------|---|---------|-----|-------|
| id | String | | cuid | PK | |
| boardId | String | | | FK → Board (Cascade), IX | **Denormalized.** Always equals `list.boardId`. Needed for single-query authorization, the realtime room, and search (ADR-006) |
| listId | String | | | FK → List (Cascade), IX(listId, position) | |
| title | String | | | | |
| description | String | ✓ | | | Raw markdown |
| position | Float | | | | |
| dueDate | DateTime | ✓ | | | |
| completed | Boolean | | false | | |
| coverAttachmentId | String | ✓ | | FK → Attachment (SetNull), UQ | The cover image (ATTACHMENTS-001): one of the card's own image attachments; deleting it clears the cover |
| archived | Boolean | | false | | |
| createdAt / updatedAt | DateTime | | | | |

### CardMember — CARD-005
| Field | Type | N | Key | Notes |
|-------|------|---|-----|-------|
| cardId | String | | PK(cardId, userId), FK → Card (Cascade) | |
| userId | String | | PK, FK → User (Cascade), IX | IX serves "cards assigned to me" |

### Label — CARD-005
| Field | Type | N | Default | Key | Notes |
|-------|------|---|---------|-----|-------|
| id | String | | cuid | PK | |
| boardId | String | | | FK → Board (Cascade), IX | Labels are per board |
| name | String | | `""` | | May be empty (colour-only label) |
| color | String | | | | Hex colour |

### CardLabel — CARD-005
| Field | Type | N | Key |
|-------|------|---|-----|
| cardId | String | | PK(cardId, labelId), FK → Card (Cascade) |
| labelId | String | | PK, FK → Label (Cascade), IX (deleting a label detaches it) |

### Checklist — CARD-005
| Field | Type | N | Default | Key |
|-------|------|---|---------|-----|
| id | String | | cuid | PK |
| cardId | String | | | FK → Card (Cascade), IX(cardId, position) |
| title | String | | | |
| position | Float | | | |

### ChecklistItem — CARD-005
| Field | Type | N | Default | Key |
|-------|------|---|---------|-----|
| id | String | | cuid | PK |
| checklistId | String | | | FK → Checklist (Cascade), IX(checklistId, position) |
| content | String | | | |
| done | Boolean | | false | |
| position | Float | | | |

### Comment — CARD-005
| Field | Type | N | Default | Key | Notes |
|-------|------|---|---------|-----|-------|
| id | String | | cuid | PK | |
| cardId | String | | | FK → Card (Cascade), IX(cardId, createdAt) | IX serves pagination |
| authorId | String | | | FK → User (**Restrict**), IX | Users with comments are anonymized, not deleted; IX serves the FK |
| content | String | | | | Raw markdown |
| createdAt / updatedAt | DateTime | | | | `updatedAt` shows "edited" and is the realtime version |

### Attachment — ATTACHMENTS-001
| Field | Type | N | Default | Key | Notes |
|-------|------|---|---------|-----|-------|
| id | String | | cuid | PK | |
| cardId | String | | | FK → Card (Cascade), IX | |
| uploaderId | String | | | FK → User (Restrict) | Needed for "uploader may delete" |
| storageKey | String | | | UQ | S3 object key `<workspaceId>/<cardId>/<uuid>` (ADR-020); signed URLs are made from it on every read, so no URL is stored |
| fileName | String | | | | Sanitized original name |
| mimeType | String | | | | Verified MIME; needed for rendering and allowlist |
| size | Int | | | | Bytes; needed for plan limits |
| createdAt | DateTime | | now | | |

### Activity — BOARD-001 (`cardId` added in CARD-001)
| Field | Type | N | Default | Key | Notes |
|-------|------|---|---------|-----|-------|
| id | String | | cuid | PK | |
| boardId | String | | | FK → Board (Cascade), IX(boardId, createdAt) | |
| cardId | String | ✓ | | FK → Card (**SetNull**), IX(cardId, createdAt) | Null for board/list events; keeps history when a card is deleted |
| userId | String | | | FK → User (Restrict) | Actor |
| type | ActivityType | | | | |
| data | Json | | | | Event details (e.g. `{ fromListId, toListId }`); shape per type in `@trello-clone/shared` |
| createdAt | DateTime | | now | | Append-only |

### Notification — NOTIFICATIONS-001
In-app notifications ([api/notifications.md](../api/notifications.md), ADR-021). Rows are written in the transaction of the change that causes them; due-soon rows when the recipient reads their notifications (no job runner).

| Field | Type | N | Default | Key | Notes |
|-------|------|---|---------|-----|-------|
| id | String | | cuid | PK | |
| userId | String | | | FK → User (Cascade), IX(userId, createdAt DESC, id DESC) | The recipient; IX serves the newest-first list |
| type | NotificationType | | | | |
| workspaceId | String | | | FK → Workspace (Cascade), IX | Every type has one; visibility is re-checked against membership on read; IX serves the FK |
| actorId | String | ✓ | | FK → User (SetNull), IX | Who caused it; null for `CARD_DUE_SOON`; IX serves the FK |
| boardId | String | ✓ | | FK → Board (Cascade), IX | Card types: the card's board, moved with the card (PATCH /cards/:cardId/move); IX serves the FK |
| cardId | String | ✓ | | FK → Card (Cascade), IX | Card types; IX serves the FK |
| commentId | String | ✓ | | FK → Comment (Cascade), IX | `CARD_COMMENTED`, `CARD_MENTIONED` |
| inviteId | String | ✓ | | FK → WorkspaceInvite (Cascade), IX | `WORKSPACE_INVITED`; a re-invite deletes the old invite row and so its notification |
| dedupeKey | String | ✓ | | UQ(userId, dedupeKey) | `due:{cardId}:{dueDate ISO}` for `CARD_DUE_SOON` (one per card and due date); null for the other types |
| readAt | DateTime | ✓ | | IX(userId, readAt) | Null = unread; IX serves the unread count |
| createdAt | DateTime | | now | | |

### Subscription — BILLING-001
| Field | Type | N | Default | Key | Notes |
|-------|------|---|---------|-----|-------|
| id | String | | cuid | PK | |
| workspaceId | String | | | UQ, FK → Workspace (Cascade) | One subscription per workspace |
| stripeCustomerId | String | ✓ | | UQ | Null until checkout starts |
| stripeSubId | String | ✓ | | UQ | Null until checkout completes |
| status | SubscriptionStatus | | | | |
| currentPeriodEnd | DateTime | ✓ | | | |
| updatedAt | DateTime | | auto | | |

`status` is `INCOMPLETE` from the first checkout until the webhook syncs a subscription.

### StripeEvent — BILLING-001
Stripe webhook events already applied, for idempotency (Stripe offers no receiver-side deduplication). Not tenant-scoped: it holds only Stripe's ids.
| Field | Type | N | Default | Key | Notes |
|-------|------|---|---------|-----|-------|
| id | String | | | PK | Stripe's `evt_…` id, written in the transaction that applies the event |
| createdAt | DateTime | | now | | |

---

## Changelog vs. the original plan
| Change | Why |
|--------|-----|
| + `RefreshToken` | Refresh-token rotation and reuse detection |
| + `WorkspaceInvite` | Invite flow needs token storage |
| + `Card.boardId` | Single-query authorization and realtime routing |
| `Activity.type` → enum; + `Activity.cardId` | Typed activity; card-level activity in the card modal |
| `Subscription.status` → enum | No free-form strings |
| `Attachment` + `uploaderId`, `mimeType`, `storageKey` | Delete permission, rendering/allowlist, file deletion |
| `updatedAt` on Board, List, Card, Comment | Realtime `version`; "edited" marker on comments |
| `Checklist.position` | Ordering multiple checklists on a card |
| Additional indexes | See [relationships.md → Indexes](relationships.md#indexes-and-key-queries) |

## Reference Prisma schema (target state after Phase 7)

```prisma
// Prisma 7 (ADR-015): the URL lives in prisma.config.ts; the client is generated into src/generated/prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
datasource db { provider = "postgresql" }

enum Role               { OWNER ADMIN MEMBER VIEWER }
enum Plan               { FREE PRO }
enum SubscriptionStatus { ACTIVE TRIALING PAST_DUE CANCELED INCOMPLETE }
enum ActivityType {
  BOARD_CREATED BOARD_UPDATED
  LIST_CREATED LIST_UPDATED LIST_MOVED LIST_ARCHIVED
  CARD_CREATED CARD_UPDATED CARD_MOVED CARD_ARCHIVED
  MEMBER_ADDED MEMBER_REMOVED COMMENT_ADDED
  LABEL_ADDED LABEL_REMOVED CHECKLIST_ADDED CHECKLIST_REMOVED CHECKLIST_ITEM_CHECKED
  ATTACHMENT_ADDED
}

enum NotificationType {
  CARD_ASSIGNED CARD_COMMENTED CARD_MENTIONED CARD_DUE_SOON WORKSPACE_INVITED
}

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  name          String
  avatarUrl     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  memberships   WorkspaceMember[]
  refreshTokens RefreshToken[]
  cards         CardMember[]
  comments      Comment[]
  activities    Activity[]
  attachments   Attachment[]
  invitesSent   WorkspaceInvite[]
  notifications       Notification[] @relation("NotificationRecipient")
  notificationsCaused Notification[] @relation("NotificationActor")
}

model RefreshToken {
  id           String    @id @default(cuid())
  userId       String
  tokenHash    String    @unique
  familyId     String
  expiresAt    DateTime
  revokedAt    DateTime?
  replacedById String?
  createdAt    DateTime  @default(now())
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([familyId])
}

model Workspace {
  id           String   @id @default(cuid())
  name         String
  slug         String   @unique
  plan         Plan     @default(FREE)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  members      WorkspaceMember[]
  invites      WorkspaceInvite[]
  boards       Board[]
  subscription Subscription?
  notifications Notification[]
}

model WorkspaceMember {
  userId      String
  workspaceId String
  role        Role      @default(MEMBER)
  joinedAt    DateTime  @default(now())
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  @@id([userId, workspaceId])
  @@index([workspaceId])
  @@index([userId])
}

model WorkspaceInvite {
  id          String    @id @default(cuid())
  workspaceId String
  email       String
  role        Role      @default(MEMBER)
  tokenHash   String    @unique
  invitedById String
  expiresAt   DateTime
  acceptedAt  DateTime?
  createdAt   DateTime  @default(now())
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  invitedBy   User      @relation(fields: [invitedById], references: [id], onDelete: Cascade)
  notifications Notification[]
  @@unique([workspaceId, email])
  @@index([invitedById])
}

model Board {
  id          String    @id @default(cuid())
  workspaceId String
  title       String
  background  String    @default("#0079bf")
  archived    Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  lists       List[]
  cards       Card[]
  labels      Label[]
  activities  Activity[]
  notifications Notification[]
  @@index([workspaceId, archived])
}

model List {
  id        String   @id @default(cuid())
  boardId   String
  title     String
  position  Float
  archived  Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  board     Board    @relation(fields: [boardId], references: [id], onDelete: Cascade)
  cards     Card[]
  @@index([boardId, position])
}

model Card {
  id          String    @id @default(cuid())
  boardId     String
  listId      String
  title       String
  description String?
  position    Float
  dueDate     DateTime?
  completed   Boolean   @default(false)
  coverAttachmentId String? @unique
  archived    Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  board       Board     @relation(fields: [boardId], references: [id], onDelete: Cascade)
  list        List      @relation(fields: [listId], references: [id], onDelete: Cascade)
  members     CardMember[]
  labels      CardLabel[]
  checklists  Checklist[]
  comments    Comment[]
  attachments Attachment[] @relation("CardAttachments")
  coverAttachment Attachment? @relation("CardCover", fields: [coverAttachmentId], references: [id], onDelete: SetNull)
  activities  Activity[]
  notifications Notification[]
  @@index([listId, position])
  @@index([boardId])
}

model CardMember {
  cardId String
  userId String
  card   Card @relation(fields: [cardId], references: [id], onDelete: Cascade)
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([cardId, userId])
  @@index([userId])
}

model Label {
  id      String @id @default(cuid())
  boardId String
  name    String @default("")
  color   String
  board   Board  @relation(fields: [boardId], references: [id], onDelete: Cascade)
  cards   CardLabel[]
  @@index([boardId])
}

model CardLabel {
  cardId  String
  labelId String
  card    Card  @relation(fields: [cardId], references: [id], onDelete: Cascade)
  label   Label @relation(fields: [labelId], references: [id], onDelete: Cascade)
  @@id([cardId, labelId])
  @@index([labelId])
}

model Checklist {
  id       String @id @default(cuid())
  cardId   String
  title    String
  position Float
  card     Card   @relation(fields: [cardId], references: [id], onDelete: Cascade)
  items    ChecklistItem[]
  @@index([cardId, position])
}

model ChecklistItem {
  id          String    @id @default(cuid())
  checklistId String
  content     String
  done        Boolean   @default(false)
  position    Float
  checklist   Checklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)
  @@index([checklistId, position])
}

model Comment {
  id        String   @id @default(cuid())
  cardId    String
  authorId  String
  content   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  card      Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  author    User     @relation(fields: [authorId], references: [id], onDelete: Restrict)
  notifications Notification[]
  @@index([cardId, createdAt])
  @@index([authorId])
}

model Attachment {
  id         String   @id @default(cuid())
  cardId     String
  uploaderId String
  storageKey String   @unique
  fileName   String
  mimeType   String
  size       Int
  createdAt  DateTime @default(now())
  card       Card     @relation("CardAttachments", fields: [cardId], references: [id], onDelete: Cascade)
  uploader   User     @relation(fields: [uploaderId], references: [id], onDelete: Restrict)
  coverOf    Card?    @relation("CardCover")
  @@index([cardId, createdAt])
}

model Activity {
  id        String       @id @default(cuid())
  boardId   String
  cardId    String?
  userId    String
  type      ActivityType
  data      Json
  createdAt DateTime     @default(now())
  board     Board        @relation(fields: [boardId], references: [id], onDelete: Cascade)
  card      Card?        @relation(fields: [cardId], references: [id], onDelete: SetNull)
  user      User         @relation(fields: [userId], references: [id], onDelete: Restrict)
  @@index([boardId, createdAt])
  @@index([cardId, createdAt])
}

model Notification {
  id          String           @id @default(cuid())
  userId      String
  type        NotificationType
  workspaceId String
  actorId     String?
  boardId     String?
  cardId      String?
  commentId   String?
  inviteId    String?
  dedupeKey   String?
  readAt      DateTime?
  createdAt   DateTime         @default(now())
  user        User             @relation("NotificationRecipient", fields: [userId], references: [id], onDelete: Cascade)
  actor       User?            @relation("NotificationActor", fields: [actorId], references: [id], onDelete: SetNull)
  workspace   Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  board       Board?           @relation(fields: [boardId], references: [id], onDelete: Cascade)
  card        Card?            @relation(fields: [cardId], references: [id], onDelete: Cascade)
  comment     Comment?         @relation(fields: [commentId], references: [id], onDelete: Cascade)
  invite      WorkspaceInvite? @relation(fields: [inviteId], references: [id], onDelete: Cascade)
  @@unique([userId, dedupeKey])
  @@index([userId, createdAt(sort: Desc), id(sort: Desc)])
  @@index([userId, readAt])
  @@index([workspaceId])
  @@index([actorId])
  @@index([boardId])
  @@index([cardId])
  @@index([commentId])
  @@index([inviteId])
}

model Subscription {
  id               String             @id @default(cuid())
  workspaceId      String             @unique
  stripeCustomerId String?            @unique
  stripeSubId      String?            @unique
  status           SubscriptionStatus
  currentPeriodEnd DateTime?
  updatedAt        DateTime           @updatedAt
  workspace        Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}

model StripeEvent {
  id        String   @id
  createdAt DateTime @default(now())
}
```

## Migration log

| Migration | Task | Change |
|-----------|------|--------|
| `20260928153607_init_user` | FOUNDATION-004 | `User` table, unique index on `email` |
| `20260929101050_add_refresh_token` | AUTH-001 | `RefreshToken` table (FK → `User`, cascade), unique `tokenHash`, indexes on `userId` and `familyId` |
| `20260930083901_add_workspaces` | WORKSPACE-001 | Enums `Role`, `Plan`; `Workspace` (unique `slug`) and `WorkspaceMember` (PK `(userId, workspaceId)`, FKs → `User` and `Workspace` with cascade, indexes on `workspaceId` and `userId`) |
| `20260930094251_add_workspace_invites` | WORKSPACE-004 | `WorkspaceInvite` (unique `tokenHash`, unique `(workspaceId, email)`, FKs → `Workspace` and `User` (inviter) with cascade) |
| `20260930141107_add_invite_inviter_index` | WORKSPACE-004 | Index on `WorkspaceInvite.invitedById` (its FK cascades on user delete) |
| `20260930144700_add_boards_activity` | BOARD-001 | Enum `ActivityType` (`BOARD_CREATED`, `BOARD_UPDATED`; later tasks add theirs); `Board` (FK → `Workspace` cascade, index `(workspaceId, archived)`); `Activity` without `cardId` (FK → `Board` cascade, FK → `User` restrict, index `(boardId, createdAt)`) |
| `20260930153801_add_lists` | LIST-001 | `ActivityType` += `LIST_CREATED`; `List` (FK → `Board` cascade, index `(boardId, position)`) |
| `20260930182143_add_list_activity_types` | LIST-002 | `ActivityType` += `LIST_UPDATED`, `LIST_ARCHIVED` |
| `20261001000501_add_list_moved_type` | LIST-003 | `ActivityType` += `LIST_MOVED` |
| `20261001004430_add_cards` | CARD-001 | `Card` (FKs → `Board` and `List` with cascade, indexes `(listId, position)` and `(boardId)`); `Activity.cardId` (FK → `Card` set null, index `(cardId, createdAt)`); `ActivityType` += `CARD_CREATED`. `Card` has no member, label, checklist, comment or attachment relations yet (CARD-005, ATTACHMENTS-001) |
| `20261001010603_add_card_activity_types` | CARD-002 | `ActivityType` += `CARD_UPDATED`, `CARD_ARCHIVED` |
| `20261001015720_add_card_moved_type` | CARD-003 | `ActivityType` += `CARD_MOVED` |
| `20261001052152_add_labels` | CARD-005a | `Label` (FK → `Board` cascade, index `(boardId)`); `CardLabel` (PK `(cardId, labelId)`, FKs cascade, index `(labelId)`); backfills the six default labels for every existing board (ids `c0…`, so they sort before labels created later) |
| `20261001061114_add_card_members` | CARD-005b | `ActivityType` += `MEMBER_ADDED`, `MEMBER_REMOVED`; `CardMember` (PK `(cardId, userId)`, FKs → `Card` and `User` cascade, index `(userId)`) |
| `20261001065625_add_checklists` | CARD-005c | `Checklist` (FK → `Card` cascade, index `(cardId, position)`); `ChecklistItem` (FK → `Checklist` cascade, index `(checklistId, position)`) |
| `20261001103116_add_comments` | CARD-005d | `ActivityType` += `COMMENT_ADDED`; `Comment` (FKs → `Card` cascade and `User` restrict, indexes `(cardId, createdAt)` and `(authorId)`) |
| `20261001115753_add_label_checklist_activity` | CARD-005 (D-25) | `ActivityType` += `LABEL_ADDED`, `LABEL_REMOVED`, `CHECKLIST_ADDED`, `CHECKLIST_REMOVED`, `CHECKLIST_ITEM_CHECKED` |
| `20261002230000_add_attachments` | ATTACHMENTS-001 | `ActivityType` += `ATTACHMENT_ADDED`; `Attachment` (FKs → `Card` cascade and `User` restrict, unique `storageKey`, index `(cardId, createdAt)`); `Card.coverUrl` (never used) replaced by `coverAttachmentId` (unique, FK → `Attachment` set null) |
| `20261003030000_add_notifications` | NOTIFICATIONS-001 | `NotificationType`; `Notification` (FKs → `User` cascade as recipient and set null as actor, `Workspace`/`Board`/`Card`/`Comment`/`WorkspaceInvite` cascade; unique `(userId, dedupeKey)`; indexes `(userId, createdAt DESC, id DESC)`, `(userId, readAt)`, `cardId`, `commentId`, `inviteId`) |
| `20261003040000_index_notification_fks` | NOTIFICATIONS-001 | Indexes on `Notification.workspaceId`, `actorId`, `boardId` (their FKs cascade or set null on delete) |
| `20261003050000_add_subscriptions` | BILLING-001 | `SubscriptionStatus`; `Subscription` (unique `workspaceId` with FK → `Workspace` cascade, unique `stripeCustomerId` and `stripeSubId`) |
| `20261003060000_add_stripe_events` | BILLING-001 | `StripeEvent` (PK `id`): applied webhook events |
