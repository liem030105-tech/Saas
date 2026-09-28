# Kế hoạch dự án SaaS Demo

## 1. Tech stack

| Tầng | Công nghệ |
|------|-----------|
| Frontend | React 18 + Vite + TypeScript, React Router, TanStack Query, Tailwind CSS |
| Backend | Node.js + Express (TypeScript), Zod (validate), JWT auth |
| Database | PostgreSQL + Prisma ORM |
| Thanh toán (demo) | Stripe test mode (tuỳ chọn) |
| Dev tools | pnpm workspaces (monorepo), ESLint, Prettier, Vitest |
| Deploy (gợi ý) | FE: Vercel/Netlify · BE: Render/Railway · DB: Supabase/Neon |

### Cấu trúc thư mục dự kiến
```
saas/
├── apps/
│   ├── web/        # React (Vite)
│   └── api/        # Node.js (Express)
├── packages/
│   └── shared/     # types, schema Zod dùng chung
├── plan.md
└── package.json
```

## 2. Ý tưởng project

### Ý tưởng 1: TaskFlow – quản lý công việc cho team
- Workspace, project, task dạng Kanban (kéo thả)
- Mời thành viên, phân quyền (owner / member)
- Gói Free (3 project) / Pro (không giới hạn)
- Độ khó: ⭐⭐ · Phù hợp demo đầy đủ tính năng SaaS

### Ý tưởng 2: BookEasy – đặt lịch hẹn online
- Chủ tiệm (spa, phòng khám, salon) tạo dịch vụ + khung giờ
- Khách đặt lịch qua link công khai, nhận email xác nhận
- Dashboard thống kê lịch hẹn
- Độ khó: ⭐⭐

### Ý tưởng 3: InvoiceHub – tạo & quản lý hoá đơn
- Quản lý khách hàng, tạo hoá đơn, xuất PDF
- Theo dõi trạng thái: nháp / đã gửi / đã thanh toán
- Biểu đồ doanh thu theo tháng
- Độ khó: ⭐⭐

### Ý tưởng 4: LinkPulse – rút gọn link & thống kê click
- Tạo link ngắn, QR code
- Thống kê click theo thời gian, quốc gia, thiết bị
- Gói trả phí: custom domain, nhiều link hơn
- Độ khó: ⭐ (nhỏ gọn, làm nhanh)

### Ý tưởng 5: FeedbackBoard – thu thập góp ý sản phẩm
- Người dùng gửi đề xuất, vote, bình luận
- Roadmap công khai (Planned / In progress / Done)
- Widget nhúng vào website khác
- Độ khó: ⭐⭐

### Ý tưởng 6: MiniCRM – quản lý khách hàng cho doanh nghiệp nhỏ
- Danh bạ khách hàng, pipeline bán hàng (deal stages)
- Ghi chú, lịch nhắc việc
- Báo cáo tỉ lệ chốt deal
- Độ khó: ⭐⭐⭐

**Đề xuất:** Chọn **TaskFlow** (đủ các thành phần SaaS điển hình: multi-tenant, phân quyền, gói cước) hoặc **LinkPulse** nếu muốn làm nhanh.

## 3. Tính năng SaaS chung (áp dụng cho mọi ý tưởng)
- Landing page + trang Pricing
- Đăng ký / đăng nhập (email + mật khẩu, JWT access/refresh token)
- Multi-tenant: mỗi user/tổ chức có dữ liệu riêng
- Dashboard + trang Settings (profile, đổi mật khẩu)
- Gói cước Free/Pro, giới hạn theo gói
- Trang admin đơn giản (xem user, gói)

## 4. Lộ trình triển khai

| Giai đoạn | Nội dung |
|-----------|----------|
| 1. Khởi tạo | Monorepo, cấu hình Vite + Express + Prisma, ESLint/Prettier |
| 2. Auth | Model User, API register/login/refresh, trang Login/Register, route bảo vệ |
| 3. Tính năng lõi | CRUD chính của ý tưởng được chọn (API + UI) |
| 4. Billing | Gói cước, giới hạn theo gói, Stripe test mode (tuỳ chọn) |
| 5. Hoàn thiện | Landing, Pricing, Settings, xử lý lỗi, loading state |
| 6. Test & deploy | Unit test API, build, hướng dẫn deploy trong README |

## 5. Bước tiếp theo
Chọn một ý tưởng ở mục 2 → chi tiết hoá schema database và danh sách API cho ý tưởng đó.
