# Database Schema

> **Domain:** Prisma model definitions.
> This is the **interim reference** until `Trello-Clone-BE/prisma/schema.prisma` exists. After that, `schema.prisma` is the source of truth and this file keeps only explanations and a changelog.
> Relations, cascades, indexes, positions: [relationships.md](relationships.md).

## Changes from the previous plan
| Change | Why |
|--------|-----|
| + `RefreshToken` | Required for refresh-token rotation and reuse detection |
| + `WorkspaceInvite` | The invite API needs somewhere to store invite tokens |
| + `Card.boardId` | Single-query authorization and realtime routing; must be updated when a card moves across boards |
| `Activity.type` → `ActivityType` enum; + optional `cardId` | Typed activity; filter activity per card |
| `Subscription.status` → enum | No free-form strings |
| `Attachment` + `uploaderId`, `mimeType` | Know who uploaded; supports type validation |
| `Comment` + `updatedAt`; `Card`, `List`, `Board` + `updatedAt` | Used as realtime `version` |
| New indexes: `WorkspaceMember(userId)`, `Comment(cardId, createdAt)`, `Attachment(cardId)`, `Card(boardId)` | Performance for authorization and child queries |
| `Comment.author` / `Activity.user`: explicit `onDelete: Restrict` | Users with history are not deleted; account deletion anonymizes instead (see relationships.md) |

## Schema

```prisma
generator client { provider = "prisma-client-js" }
datasource db   { provider = "postgresql"; url = env("DATABASE_URL") }

enum Role               { OWNER ADMIN MEMBER VIEWER }
enum Plan               { FREE PRO }
enum SubscriptionStatus { ACTIVE TRIALING PAST_DUE CANCELED INCOMPLETE }
enum ActivityType {
  BOARD_CREATED BOARD_UPDATED
  LIST_CREATED LIST_UPDATED LIST_MOVED LIST_ARCHIVED
  CARD_CREATED CARD_UPDATED CARD_MOVED CARD_ARCHIVED
  MEMBER_ADDED MEMBER_REMOVED COMMENT_ADDED ATTACHMENT_ADDED
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
  cardMembers   CardMember[]
  comments      Comment[]
  activities    Activity[]
  attachments   Attachment[]
  invitesSent   WorkspaceInvite[]
}

model RefreshToken {
  id           String    @id @default(cuid())
  userId       String
  tokenHash    String    @unique          // sha256 of the token
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
  @@unique([workspaceId, email])
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
  @@index([workspaceId, archived])
}

model List {
  id        String   @id @default(cuid())
  boardId   String
  title     String
  position  Float
  archived  Boolean  @default(false)
  updatedAt DateTime @updatedAt
  board     Board    @relation(fields: [boardId], references: [id], onDelete: Cascade)
  cards     Card[]
  @@index([boardId, position])
}

model Card {
  id          String    @id @default(cuid())
  boardId     String                       // denormalized; must always equal list.boardId
  listId      String
  title       String
  description String?
  position    Float
  dueDate     DateTime?
  completed   Boolean   @default(false)
  coverUrl    String?
  archived    Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  board       Board     @relation(fields: [boardId], references: [id], onDelete: Cascade)
  list        List      @relation(fields: [listId], references: [id], onDelete: Cascade)
  members     CardMember[]
  labels      CardLabel[]
  checklists  Checklist[]
  comments    Comment[]
  attachments Attachment[]
  activities  Activity[]
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
  name    String
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
}

model Checklist {
  id       String @id @default(cuid())
  cardId   String
  title    String
  position Float
  card     Card   @relation(fields: [cardId], references: [id], onDelete: Cascade)
  items    ChecklistItem[]
  @@index([cardId])
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
  @@index([cardId, createdAt])
}

model Attachment {
  id         String   @id @default(cuid())
  cardId     String
  uploaderId String
  url        String
  storageKey String
  fileName   String
  mimeType   String
  size       Int
  createdAt  DateTime @default(now())
  card       Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  uploader   User     @relation(fields: [uploaderId], references: [id], onDelete: Restrict)
  @@index([cardId])
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
```
