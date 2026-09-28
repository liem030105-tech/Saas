# Kế hoạch dự án: TaskBoard – Trello Clone SaaS

## 1. Tổng quan

**TaskBoard** là ứng dụng SaaS quản lý công việc theo mô hình Kanban (tương tự Trello). Người dùng tạo workspace, board, list và card, rồi kéo thả card giữa các cột để theo dõi tiến độ, cộng tác cùng team theo thời gian thực.

### Mục tiêu
- Xây dựng một SaaS demo đầy đủ: xác thực, multi-tenant, phân quyền, gói cước.
- Trải nghiệm kéo thả mượt, cập nhật realtime giữa nhiều người dùng.
- Mã nguồn rõ ràng, dễ mở rộng, có test và hướng dẫn deploy.

### Đối tượng người dùng
- Cá nhân quản lý việc riêng.
- Team nhỏ (startup, nhóm học tập, freelancer) cần công cụ Kanban đơn giản.

---

## 2. Tech stack

| Tầng | Công nghệ | Vai trò |
|------|-----------|---------|
| Frontend | React 18 + Vite + TypeScript | UI SPA |
| | React Router v6 | Điều hướng |
| | TanStack Query | Gọi API, cache, optimistic update |
| | Zustand | State UI cục bộ (modal, filter) |
| | @dnd-kit | Kéo thả list/card |
| | Tailwind CSS + shadcn/ui | Giao diện |
| | React Hook Form + Zod | Form & validate |
| | socket.io-client | Realtime |
| Backend | Node.js 20 + Express + TypeScript | REST API |
| | Prisma ORM + PostgreSQL | Lưu trữ dữ liệu |
| | Zod | Validate request |
| | JWT (access + refresh) + bcrypt | Xác thực |
| | Socket.IO | Đồng bộ realtime |
| | Multer + S3/Cloudinary | Upload file đính kèm |
| | Pino | Logging |
| Chung | pnpm workspaces (monorepo) | Quản lý package |
| | ESLint + Prettier | Chất lượng code |
| | Vitest, Supertest, Playwright | Test |
| | Docker Compose | Chạy Postgres local |

---

## 3. Kiến trúc & cấu trúc thư mục

```
React SPA  ──HTTP (REST)──▶  Express API  ──Prisma──▶  PostgreSQL
    ▲                            │
    └──────WebSocket (Socket.IO)─┘
```

```
saas/
├── apps/
│   ├── web/                     # React frontend
│   │   ├── src/
│   │   │   ├── api/             # client gọi API (axios + interceptors)
│   │   │   ├── components/      # UI dùng chung (Button, Modal, Avatar…)
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   ├── workspaces/
│   │   │   │   ├── boards/
│   │   │   │   ├── lists/
│   │   │   │   └── cards/
│   │   │   ├── hooks/
│   │   │   ├── pages/
│   │   │   ├── stores/          # Zustand
│   │   │   ├── lib/             # socket, utils
│   │   │   └── main.tsx
│   │   └── vite.config.ts
│   └── api/                     # Node.js backend
│       ├── src/
│       │   ├── config/          # env, logger
│       │   ├── middlewares/     # auth, error, validate, rateLimit
│       │   ├── modules/
│       │   │   ├── auth/        # route + controller + service
│       │   │   ├── users/
│       │   │   ├── workspaces/
│       │   │   ├── boards/
│       │   │   ├── lists/
│       │   │   ├── cards/
│       │   │   ├── comments/
│       │   │   └── billing/
│       │   ├── realtime/        # Socket.IO handlers
│       │   ├── app.ts
│       │   └── server.ts
│       └── prisma/
│           ├── schema.prisma
│           └── seed.ts
├── packages/
│   └── shared/                  # Zod schema + TypeScript types dùng chung
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
└── plan.md
```

Mỗi module backend theo mô hình: `*.routes.ts` → `*.controller.ts` → `*.service.ts` → Prisma.

---

## 4. Tính năng

### 4.1 MVP (bắt buộc)
- **Auth:** đăng ký, đăng nhập, đăng xuất, refresh token, xem/sửa profile.
- **Workspace:** tạo/sửa/xoá, mời thành viên qua email, gán vai trò.
- **Board:** tạo/sửa/xoá, đổi màu nền, đánh dấu sao (favorite), lưu trữ (archive).
- **List:** tạo/đổi tên/xoá/archive, kéo thả sắp xếp.
- **Card:**
  - Tạo nhanh, sửa tiêu đề và mô tả (markdown).
  - Kéo thả trong list và giữa các list.
  - Gán thành viên, label màu, ngày hết hạn (due date).
  - Checklist với thanh tiến độ.
  - Bình luận.
- **Activity log:** lịch sử thay đổi trên board/card.

### 4.2 Mở rộng
- Realtime: nhiều người xem cùng board thấy thay đổi ngay.
- Đính kèm file/ảnh, ảnh bìa card.
- Tìm kiếm & lọc card (theo label, thành viên, hạn).
- Thông báo trong app (được gán card, được nhắc tên, sắp đến hạn).
- Gói Free/Pro với Stripe test mode.
- Template board (Kanban cơ bản, Sprint, Todo cá nhân).
- Dark mode.

---

## 5. Database schema (Prisma)

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  avatarUrl    String?
  createdAt    DateTime @default(now())
  memberships  WorkspaceMember[]
  cards        CardMember[]
  comments     Comment[]
  activities   Activity[]
}

model Workspace {
  id           String   @id @default(cuid())
  name         String
  slug         String   @unique
  plan         Plan     @default(FREE)
  createdAt    DateTime @default(now())
  members      WorkspaceMember[]
  boards       Board[]
  subscription Subscription?
}

model WorkspaceMember {
  userId      String
  workspaceId String
  role        Role     @default(MEMBER)
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  @@id([userId, workspaceId])
}

model Board {
  id          String   @id @default(cuid())
  workspaceId String
  title       String
  background  String   @default("#0079bf")
  archived    Boolean  @default(false)
  createdAt   DateTime @default(now())
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  lists       List[]
  labels      Label[]
  activities  Activity[]
}

model List {
  id       String  @id @default(cuid())
  boardId  String
  title    String
  position Float
  archived Boolean @default(false)
  board    Board   @relation(fields: [boardId], references: [id], onDelete: Cascade)
  cards    Card[]
  @@index([boardId, position])
}

model Card {
  id          String    @id @default(cuid())
  listId      String
  title       String
  description String?
  position    Float
  dueDate     DateTime?
  completed   Boolean   @default(false)
  coverUrl    String?
  archived    Boolean   @default(false)
  createdAt   DateTime  @default(now())
  list        List      @relation(fields: [listId], references: [id], onDelete: Cascade)
  members     CardMember[]
  labels      CardLabel[]
  checklists  Checklist[]
  comments    Comment[]
  attachments Attachment[]
  @@index([listId, position])
}

model CardMember {
  cardId String
  userId String
  card   Card @relation(fields: [cardId], references: [id], onDelete: Cascade)
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([cardId, userId])
}

model Label {
  id      String @id @default(cuid())
  boardId String
  name    String
  color   String
  board   Board  @relation(fields: [boardId], references: [id], onDelete: Cascade)
  cards   CardLabel[]
}

model CardLabel {
  cardId  String
  labelId String
  card    Card  @relation(fields: [cardId], references: [id], onDelete: Cascade)
  label   Label @relation(fields: [labelId], references: [id], onDelete: Cascade)
  @@id([cardId, labelId])
}

model Checklist {
  id     String @id @default(cuid())
  cardId String
  title  String
  card   Card   @relation(fields: [cardId], references: [id], onDelete: Cascade)
  items  ChecklistItem[]
}

model ChecklistItem {
  id          String    @id @default(cuid())
  checklistId String
  content     String
  done        Boolean   @default(false)
  position    Float
  checklist   Checklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)
}

model Comment {
  id        String   @id @default(cuid())
  cardId    String
  authorId  String
  content   String
  createdAt DateTime @default(now())
  card      Card @relation(fields: [cardId], references: [id], onDelete: Cascade)
  author    User @relation(fields: [authorId], references: [id])
}

model Attachment {
  id        String   @id @default(cuid())
  cardId    String
  url       String
  fileName  String
  size      Int
  createdAt DateTime @default(now())
  card      Card @relation(fields: [cardId], references: [id], onDelete: Cascade)
}

model Activity {
  id        String   @id @default(cuid())
  boardId   String
  userId    String
  type      String   // CARD_CREATED, CARD_MOVED, COMMENT_ADDED...
  data      Json
  createdAt DateTime @default(now())
  board     Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
  user      User  @relation(fields: [userId], references: [id])
  @@index([boardId, createdAt])
}

model Subscription {
  id               String    @id @default(cuid())
  workspaceId      String    @unique
  stripeCustomerId String?
  stripeSubId      String?
  status           String
  currentPeriodEnd DateTime?
  workspace        Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}

enum Role { OWNER ADMIN MEMBER VIEWER }
enum Plan { FREE PRO }
```

### Sắp xếp vị trí (position)
- Dùng số thực (`Float`), phần tử mới được thêm cuối cột với `position = max + 1024`.
- Khi kéo phần tử vào giữa A và B: `position = (A.position + B.position) / 2`, nên chỉ phải cập nhật 1 bản ghi.
- Khi khoảng cách giữa hai vị trí quá nhỏ (< 0.0001), đánh số lại (rebalance) toàn bộ cột.

---

## 6. REST API

Tiền tố: `/api/v1`. Các endpoint (trừ auth) đều yêu cầu header `Authorization: Bearer <accessToken>`.

### Auth
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/auth/register` | Đăng ký |
| POST | `/auth/login` | Đăng nhập, trả access token + refresh token (httpOnly cookie) |
| POST | `/auth/refresh` | Cấp lại access token |
| POST | `/auth/logout` | Thu hồi refresh token |
| GET | `/auth/me` | Thông tin user hiện tại |
| PATCH | `/users/me` | Cập nhật profile |

### Workspace
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/workspaces` | Danh sách workspace của user |
| POST | `/workspaces` | Tạo workspace |
| PATCH | `/workspaces/:id` | Sửa |
| DELETE | `/workspaces/:id` | Xoá (OWNER) |
| GET | `/workspaces/:id/members` | Danh sách thành viên |
| POST | `/workspaces/:id/invites` | Mời qua email |
| PATCH | `/workspaces/:id/members/:userId` | Đổi vai trò |
| DELETE | `/workspaces/:id/members/:userId` | Xoá thành viên |

### Board
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/workspaces/:id/boards` | Danh sách board |
| POST | `/workspaces/:id/boards` | Tạo board |
| GET | `/boards/:id` | Chi tiết board kèm list + card |
| PATCH | `/boards/:id` | Sửa tiêu đề/màu/archive |
| DELETE | `/boards/:id` | Xoá |
| GET | `/boards/:id/activities` | Activity log (phân trang) |
| GET / POST | `/boards/:id/labels` | Quản lý label |

### List
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/boards/:id/lists` | Tạo list |
| PATCH | `/lists/:id` | Đổi tên, archive, đổi `position` |
| DELETE | `/lists/:id` | Xoá |

### Card
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/lists/:id/cards` | Tạo card |
| GET | `/cards/:id` | Chi tiết card |
| PATCH | `/cards/:id` | Sửa nội dung, due date, hoàn thành |
| PATCH | `/cards/:id/move` | Di chuyển `{ listId, position }` |
| DELETE | `/cards/:id` | Xoá |
| POST / DELETE | `/cards/:id/members/:userId` | Gán/bỏ gán thành viên |
| POST / DELETE | `/cards/:id/labels/:labelId` | Gắn/gỡ label |
| POST | `/cards/:id/checklists` | Tạo checklist |
| POST / PATCH / DELETE | `/checklists/:id/items[/:itemId]` | Quản lý item |
| GET / POST | `/cards/:id/comments` | Bình luận |
| POST | `/cards/:id/attachments` | Upload file |

### Billing
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/billing/checkout` | Tạo Stripe Checkout session |
| POST | `/billing/portal` | Mở Stripe customer portal |
| POST | `/billing/webhook` | Nhận webhook Stripe |

### Định dạng lỗi thống nhất
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Title is required", "details": [] } }
```

### Sự kiện realtime (Socket.IO)
- Client kết nối bằng access token, sau đó `join` vào room `board:<id>` (server kiểm tra quyền).
- Sự kiện server phát: `list:created`, `list:updated`, `list:deleted`, `card:created`, `card:updated`, `card:moved`, `card:deleted`, `comment:created`.
- Client nhận sự kiện thì cập nhật cache TanStack Query. Hành động của chính mình dùng optimistic update.

---

## 7. Frontend

### Các trang
| Route | Trang |
|-------|-------|
| `/` | Landing page |
| `/pricing` | Bảng giá |
| `/login`, `/register` | Xác thực |
| `/w/:slug` | Danh sách board của workspace |
| `/w/:slug/members` | Quản lý thành viên |
| `/w/:slug/settings` | Cài đặt, gói cước |
| `/b/:boardId` | Board Kanban |
| `/b/:boardId/c/:cardId` | Modal chi tiết card (URL chia sẻ được) |
| `/settings/profile` | Hồ sơ cá nhân |

### Component chính
- `AppLayout` (sidebar workspace + header), `BoardCard`, `CreateBoardDialog`
- `BoardView` → `ListColumn` → `CardItem` (bọc bởi `DndContext`, `SortableContext`)
- `CardDetailModal`: mô tả, label, thành viên, checklist, comment, activity
- `InlineEditable`, `LabelPicker`, `MemberPicker`, `DatePicker`

### Quản lý state
- **Server state:** TanStack Query với query key `['board', id]`, `['card', id]`…
- **Kéo thả:** cập nhật cache ngay (optimistic), gọi `PATCH /cards/:id/move`, rollback nếu lỗi.
- **Auth:** access token giữ trong bộ nhớ. Interceptor axios tự gọi `/auth/refresh` khi nhận 401.

---

## 8. Phân quyền & bảo mật

| Hành động | OWNER | ADMIN | MEMBER | VIEWER |
|-----------|:-----:|:-----:|:------:|:------:|
| Xem board | ✅ | ✅ | ✅ | ✅ |
| Tạo/sửa list, card, comment | ✅ | ✅ | ✅ | ❌ |
| Tạo/xoá board | ✅ | ✅ | ✅ | ❌ |
| Mời/xoá thành viên | ✅ | ✅ | ❌ | ❌ |
| Đổi gói cước, xoá workspace | ✅ | ❌ | ❌ | ❌ |

- Middleware `requireWorkspaceRole(role)` kiểm tra quyền trên mọi route, suy ra workspace từ board/list/card.
- Mật khẩu hash bằng bcrypt (cost 12). Refresh token lưu hash trong DB, xoay vòng sau mỗi lần refresh.
- Dùng Helmet, CORS whitelist, rate limit cho `/auth/*`.
- Validate mọi input bằng Zod. Prisma chống SQL injection. Sanitize markdown khi render.

---

## 9. Gói cước

| | Free | Pro ($5/user/tháng – demo) |
|--|------|-----|
| Số board / workspace | 5 | Không giới hạn |
| Thành viên / workspace | 5 | Không giới hạn |
| Dung lượng file | 10 MB/file | 100 MB/file |
| Activity log | 7 ngày | Không giới hạn |
| Template board | ❌ | ✅ |

Giới hạn được kiểm tra ở service layer. Khi vượt giới hạn, API trả lỗi `402 PLAN_LIMIT_REACHED` và FE hiện gợi ý nâng cấp.

---

## 10. Lộ trình triển khai

| Giai đoạn | Thời gian | Nội dung | Kết quả |
|-----------|-----------|----------|---------|
| 1. Khởi tạo | 2 ngày | Monorepo pnpm, Vite, Express, Prisma, Docker Postgres, ESLint/Prettier | `pnpm dev` chạy được FE + BE |
| 2. Auth | 3 ngày | User model, register/login/refresh, trang Login/Register, protected route | Đăng nhập được |
| 3. Workspace & Board | 3 ngày | CRUD workspace, board, thành viên, phân quyền | Trang danh sách board |
| 4. List & Card + kéo thả | 5 ngày | CRUD list/card, dnd-kit, thuật toán position | Board Kanban hoạt động |
| 5. Chi tiết card | 4 ngày | Label, member, due date, checklist, comment, activity | Modal card đầy đủ |
| 6. Realtime & mở rộng | 4 ngày | Socket.IO, upload file, tìm kiếm/lọc | Nhiều tab đồng bộ |
| 7. Billing & hoàn thiện | 3 ngày | Gói Free/Pro, Stripe test, Landing, Pricing, dark mode | Luồng nâng cấp |
| 8. Test & deploy | 3 ngày | Unit/integration/E2E test, CI GitHub Actions, deploy | Bản demo online |

**Tổng thời gian dự kiến:** khoảng 5 tuần (1 người).

---

## 11. Testing

- **Unit test (Vitest):** service backend (tính position, kiểm tra giới hạn gói cước), hook/util FE.
- **Integration test (Supertest):** API chạy trên Postgres test (Docker), reset DB giữa các test.
- **E2E test (Playwright):** đăng ký → tạo board → tạo list/card → kéo thả → comment.
- **CI:** GitHub Actions chạy lint, typecheck, test cho mỗi PR.

---

## 12. Biến môi trường

`apps/api/.env.example`
```
DATABASE_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
CLIENT_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STORAGE_BUCKET=
```

`apps/web/.env.example`
```
VITE_API_URL=
VITE_SOCKET_URL=
```

---

## 13. Deploy

| Thành phần | Nền tảng gợi ý |
|------------|----------------|
| Frontend | Vercel / Netlify |
| Backend + Socket.IO | Render / Railway / Fly.io |
| Database | Supabase / Neon (PostgreSQL) |
| File | Cloudinary / AWS S3 |

Khi deploy, chạy `prisma migrate deploy` trước lúc khởi động API.

---

## 14. Checklist hoàn thành (Definition of Done)

- [ ] Đăng ký/đăng nhập, refresh token hoạt động
- [ ] CRUD workspace, board, list, card
- [ ] Kéo thả list/card mượt, thứ tự được lưu
- [ ] Label, thành viên, due date, checklist, comment
- [ ] Phân quyền đúng theo bảng mục 8
- [ ] Realtime giữa 2 trình duyệt
- [ ] Giới hạn gói Free, luồng nâng cấp Pro (Stripe test)
- [ ] Test pass trên CI
- [ ] Deploy bản demo và viết README hướng dẫn chạy local
