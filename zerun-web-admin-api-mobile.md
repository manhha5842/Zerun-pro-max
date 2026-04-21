# Zerun — Web Admin, API Layer & Mobile App

> Bổ sung cho `zerun-system-design.md`. Tài liệu này thay thế các phần liên quan.

---

## 1. Kiến trúc tổng thể

```
                ┌──────────────────────────┐
                │       WEB ADMIN           │
                │   (React SPA / Next.js)   │
                └───────────┬──────────────┘
                            │
                ┌───────────▼──────────────┐
                │       REST API            │
                │     (Fastify server)      │◄──── Flutter Mobile App
                └───────────┬──────────────┘
                            │
      ┌─────────────────────▼──────────────────────┐
      │              WORKER CORE                    │
      │  BullMQ · Adapters · Processor · Scheduler  │
      └─────────────────────────────────────────────┘
                │                       │
        Source Adapters           Publish Adapters
     (TG, FB, IG, Threads, X)  (TG, FB, IG, Threads, X)
```

API server và Worker chạy chung process (Fastify). Web Admin là static SPA, serve từ cùng Fastify hoặc riêng. Mobile app gọi cùng REST API.

---

## 2. Platform Adapters

| Nền tảng | Phương thức | Crawl | Publish | Ổn định |
|----------|-------------|:-----:|:-------:|:-------:|
| Telegram | GramJS (user session) | ✅ | ✅ | 10/10 |
| X / Twitter | agent-twitter-client (npm) | ✅ | ✅ | 9/10 |
| Threads | Playwright (threads.net) | ✅ | ✅ | 7/10 |
| Instagram | instagram-private-api + Playwright fallback | ✅ | ✅ | 7/10 |
| Facebook | Playwright + stealth | ✅ | ⚠️ | 5/10 |

### Threads — Playwright trên threads.net

Đăng bài text + ảnh, đọc feed/profile, reply, quote.

**Implement:**
- Playwright persistent BrowserContext (lưu cookies)
- Login bằng Instagram credentials
- Navigate compose → nhập text → upload media → submit
- Crawl: Parse hidden JSON data trong `<script>` tags
- Stealth plugin chống detect

---

## 3. REST API Layer

### Nguyên tắc

- **Fastify** (đã có trong project)
- JWT authentication cho Web Admin + Mobile App
- Response format thống nhất: `{ success, data, error, pagination }`
- API versioning: `/api/v1/...`
- CORS config cho web admin domain + mobile app

### Authentication

```
POST /api/v1/auth/login     { username, password } → { accessToken, refreshToken }
POST /api/v1/auth/refresh   { refreshToken }       → { accessToken }
POST /api/v1/auth/logout    { refreshToken }       → { success }
```

Admin account lưu trong DB (bảng `AdminUser`). Hỗ trợ nhiều admin.

### Endpoints

#### Dashboard

```
GET  /api/v1/dashboard/stats
  → { totalContents, pendingJobs, publishedToday, failedJobs, platformHealth[] }

GET  /api/v1/dashboard/activity?limit=50
  → { activities: [{ type, message, platform, createdAt }] }
```

#### Content Management

```
GET    /api/v1/contents
  ?status=waiting_manual_convert&platform=telegram&page=1&limit=20&sort=-createdAt
  → { contents[], pagination }

GET    /api/v1/contents/:code                    → content detail + media + links
GET    /api/v1/contents/:code/preview            → preview final text
PUT    /api/v1/contents/:code/draft              → { draftText }
POST   /api/v1/contents/:code/links              → { links[] }
POST   /api/v1/contents/:code/skip
POST   /api/v1/contents/:code/reject             → { reason }
POST   /api/v1/contents/:code/retry
POST   /api/v1/contents/:code/publish
POST   /api/v1/contents/:code/schedule           → { scheduledAt, targetIds[] }
DELETE /api/v1/contents/:code
```

#### Source Management

```
GET    /api/v1/sources
POST   /api/v1/sources
PUT    /api/v1/sources/:id
DELETE /api/v1/sources/:id
POST   /api/v1/sources/:id/crawl                 → trigger manual crawl
GET    /api/v1/sources/:id/logs
```

#### Target Management

```
GET    /api/v1/targets
POST   /api/v1/targets
PUT    /api/v1/targets/:id
DELETE /api/v1/targets/:id
GET    /api/v1/targets/:id/logs
```

#### Routing Rules

```
GET    /api/v1/routing-rules
POST   /api/v1/routing-rules                     → { sourceId, targetId, autoPublish, useAI }
PUT    /api/v1/routing-rules/:id
DELETE /api/v1/routing-rules/:id
```

#### Link Conversion

```
POST   /api/v1/links/convert
  Body: { urls: ["https://shopee.vn/...", "https://lazada.vn/..."] }
  Response: {
    results: [
      { original, converted, network, success },
      { original, converted: null, network: "unknown", success: false, error: "Unsupported" }
    ]
  }

POST   /api/v1/links/detect
  Body: { text: "..." }
  Response: {
    links: [
      { url, network, position: { start, end }, supported: true }
    ]
  }
```

#### Schedule Management

```
GET    /api/v1/schedules
POST   /api/v1/schedules                         → { contentId, targetIds[], scheduledAt }
PUT    /api/v1/schedules/:id
DELETE /api/v1/schedules/:id
```

#### Platform Health & Accounts

```
GET    /api/v1/health/platforms
GET    /api/v1/accounts
PUT    /api/v1/accounts/:id
POST   /api/v1/accounts/:id/test
```

#### AI Config

```
GET    /api/v1/ai/configs
POST   /api/v1/ai/configs
PUT    /api/v1/ai/configs/:id
DELETE /api/v1/ai/configs/:id
POST   /api/v1/ai/test                           → { provider, prompt, text }
```

#### Manual Import

```
POST   /api/v1/import/upload
  Content-Type: multipart/form-data
  Fields: files[] (images/videos), caption, targetIds[]?, scheduleAt?
  → { contentId, code }
```

#### Realtime (WebSocket)

```
WS    /api/v1/ws
  Events:
    - content:new          → New content detected
    - content:status       → Status change
    - publish:success      → Published successfully
    - publish:failed       → Publish failed
    - platform:health      → Platform health change
    - crawl:complete       → Crawl batch finished
```

### Database Schema (bổ sung)

```prisma
model AdminUser {
  id              String    @id @default(cuid())
  username        String    @unique
  passwordHash    String    // bcrypt
  displayName     String?
  role            String    @default("admin")  // admin | viewer
  isActive        Boolean   @default(true)
  refreshTokens   RefreshToken[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model RefreshToken {
  id              String    @id @default(cuid())
  token           String    @unique
  adminUserId     String
  expiresAt       DateTime
  isRevoked       Boolean   @default(false)
  adminUser       AdminUser @relation(fields: [adminUserId], references: [id])
  createdAt       DateTime  @default(now())

  @@index([token])
  @@index([adminUserId])
}

// Thêm vào model Content:
// scheduledAt      DateTime?
// scheduledTargets Json?    // targetId[]
```

---

## 4. Web Admin

### Tech Stack

| Thành phần | Công nghệ |
|------------|-----------|
| Framework | Next.js 14+ (App Router) hoặc Vite + React |
| Styling | Tailwind CSS + shadcn/ui |
| State | TanStack Query (React Query) |
| Realtime | WebSocket (native) |
| Auth | JWT trong httpOnly cookie |

### Các trang

```
/login
/dashboard                      → Stats, activity, platform health
/contents                       → List (filter by status, platform, date)
/contents/:code                 → Detail: preview, edit draft, manage links, publish
/contents/:code/edit            → Rich text editor
/sources                        → CRUD
/targets                        → CRUD
/routing                        → Source → Target mapping
/schedules                      → Calendar view
/tools/convert-link             → Link conversion tool
/tools/import                   → Upload files + caption
/accounts                       → Platform account management + health
/settings                       → AI config, system settings
```

### Dashboard wireframe

```
┌─────────────────────────────────────────────────────────────┐
│  Zerun                                  [user] [logout]      │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│ Dashboard│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│ Contents │  │Pending │ │Today   │ │Failed  │ │Sources │    │
│ Sources  │  │  12    │ │Posted  │ │   2    │ │Active  │    │
│ Targets  │  │        │ │  45    │ │        │ │  8     │    │
│ Routing  │  └────────┘ └────────┘ └────────┘ └────────┘    │
│ Schedules│                                                  │
│ ──────── │  Platform Health                                 │
│ Tools    │  ┌──────────────────────────────────────────┐    │
│  Convert │  │ ✅ Telegram   ✅ X    ⚠️ Instagram       │    │
│  Import  │  │ ✅ Threads    ❌ Facebook (checkpoint)   │    │
│ ──────── │  └──────────────────────────────────────────┘    │
│ Accounts │                                                  │
│ Settings │  Recent Activity                                 │
│          │  ┌──────────────────────────────────────────┐    │
│          │  │ 14:32  JOB-1234 posted to @deals_vn     │    │
│          │  │ 14:28  JOB-1233 links converted          │    │
│          │  │ 14:15  Crawled FB Group "Sale VN" (5 new)│    │
│          │  │ 14:01  JOB-1232 failed on Instagram      │    │
│          │  └──────────────────────────────────────────┘    │
└──────────┴──────────────────────────────────────────────────┘
```

### Content Detail wireframe

```
┌──────────────────────────────────────────────────────────────┐
│  ← Back    JOB-1234    Status: [waiting_manual_convert]       │
├──────────────────────────────────────────────────────────────┤
│  Source: TG - Sale Hunters         Posted: 14/04/2026 14:00  │
│                                                              │
│  ┌─────────────────────────┐  ┌──────────────────────────┐  │
│  │   Original Text         │  │   Draft / Final Text     │  │
│  │   (read-only)           │  │   (editable textarea)    │  │
│  └─────────────────────────┘  └──────────────────────────┘  │
│                                                              │
│  Media: [img1] [img2] [video1]                               │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Detected Links                                       │    │
│  │  1. shopee.vn/product-123    →  [___converted url__] │    │
│  │  2. lazada.vn/item-456      →  [___converted url__] │    │
│  │  3. forms.google.com/...    →  [Remove] [Keep]       │    │
│  │  [Auto Convert All]  [Paste Converted Links]         │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Publish To:                                                 │
│  ☑ TG - @deals_channel    ☑ X - @affiliate_vn               │
│  ☑ Threads - @deals       ☐ IG - @shop_deals                │
│  ☐ FB - Sale Group                                           │
│                                                              │
│  [Schedule ▾]  [Preview]  [Publish Now]  [Skip]  [Reject]    │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Mobile App (Flutter)

### Vai trò (companion app)

- **Quick actions** — Approve/reject/publish nhanh khi di chuyển
- **Link converter** — Chuyển đổi link affiliate hàng ngày
- **Notifications** — Job mới, job failed
- **Monitor** — Dashboard stats, platform health

### Screens

```
├── Login
├── Home (Dashboard summary)
│   ├── Stats cards
│   ├── Platform health indicators
│   └── Recent activity feed
├── Contents (list, filterable)
│   └── Content Detail
│       ├── Preview text
│       ├── Edit draft
│       ├── Manage links
│       ├── Select targets
│       └── Actions: Publish / Schedule / Skip / Reject
├── Link Converter
│   ├── Paste / type URL
│   ├── Auto-detect network (Shopee/Lazada/...)
│   ├── Convert → Show affiliate link
│   ├── Copy to clipboard
│   └── Share via system share sheet
├── Notifications
│   ├── New content
│   ├── Job ready to publish
│   ├── Publish success/failure
│   └── Platform health alert
└── Settings
    ├── Server URL
    ├── Notification preferences
    └── Account info
```

### Authentication Flow

```
1. Login → nhận accessToken + refreshToken
2. Lưu trong Flutter Secure Storage
3. Mọi request: Authorization: Bearer <accessToken>
4. Khi 401 → auto refresh → retry
5. Khi refresh fail → redirect Login
```

### Push Notifications

Mobile app dùng WebSocket để nhận events realtime (`/api/v1/ws`). Khi app đã tắt, dùng **Firebase Cloud Messaging** (free tier).

### Tech Stack

| Thành phần | Package |
|------------|---------|
| HTTP | `dio` |
| State | `riverpod` hoặc `bloc` |
| Storage | `flutter_secure_storage` |
| WebSocket | `web_socket_channel` |
| Share | `share_plus` |
| Notifications | `flutter_local_notifications` |
| Deep link | `go_router` |

---

## 6. Kiến trúc đầy đủ

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│   │  Web Admin   │    │ Flutter App  │    │  TG Admin    │      │
│   │  (React SPA) │    │  (iOS/And)   │    │  (legacy)    │      │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│          └───────────────────┼───────────────────┘               │
│                    ┌─────────▼──────────┐                        │
│                    │    REST API        │                        │
│                    │    (Fastify)       │                        │
│                    │  /api/v1/contents  │                        │
│                    │  /api/v1/sources   │                        │
│                    │  /api/v1/targets   │                        │
│                    │  /api/v1/links     │                        │
│                    │  /api/v1/auth      │                        │
│                    │  /api/v1/ws        │                        │
│                    └─────────┬──────────┘                        │
│              ┌───────────────▼────────────────┐                  │
│              │         WORKER CORE            │                  │
│              │  BullMQ  ·  Processor Pipeline │                  │
│              │       Adapter Registry         │                  │
│              └───────────────────────────────┘                  │
│                      │                │                          │
│           ┌──────────▼───┐    ┌───────▼──────────┐              │
│           │   SOURCE     │    │    PUBLISH        │              │
│           │   ADAPTERS   │    │    ADAPTERS       │              │
│           │ TG: GramJS   │    │ TG: GramJS        │              │
│           │ X:  scraper  │    │ X:  scraper       │              │
│           │ TH: PW       │    │ TH: PW            │              │
│           │ IG: privAPI  │    │ IG: privAPI       │              │
│           │ FB: PW       │    │ FB: PW            │              │
│           └──────────────┘    └───────────────────┘              │
│           ┌──────────────────────────────────────┐               │
│           │         INFRASTRUCTURE               │               │
│           │  PostgreSQL (Prisma)                  │               │
│           │  Redis (BullMQ)                       │               │
│           │  Playwright Browser (headless)        │               │
│           │  Cloudinary (media CDN, free tier)    │               │
│           │  Local disk (media backup)            │               │
│           └──────────────────────────────────────┘               │
│  TG=Telegram  X=Twitter  TH=Threads  IG=Instagram  PW=Playwright │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Remote Access — Cloudflare Tunnel

```bash
cloudflared login
cloudflared tunnel create zerun
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: ~/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: admin.zerun.local
    service: http://localhost:3000
  - hostname: api.zerun.local
    service: http://localhost:3000
  - service: http_status:404
```

```bash
cloudflared tunnel run zerun
```

Kết quả: Web Admin tại `https://admin.zerun.local`, Flutter app gọi API tại `https://api.zerun.local/api/v1/...`

---

## 8. Roadmap

### Phase 1 — Core Refactor + API Layer (3 tuần)

```
Tuần 1:  Adapter interfaces + Registry + Prisma schema mới + migrate
Tuần 2:  REST API endpoints (auth, contents, sources, targets, links/convert)
         WebSocket foundation
Tuần 3:  Content Processor pipeline refactor
         Link converter (AccessTrade adapter)
         AI provider adapter (1 provider)
```

### Phase 2 — Web Admin + X/Twitter (3 tuần)

```
Tuần 4:  Web Admin: Login, Dashboard, Content list/detail
Tuần 5:  Web Admin: Source/Target CRUD, Routing rules, Link converter tool
         X Source + Publish adapter (agent-twitter-client)
Tuần 6:  Web Admin: Schedule calendar, Import tool
         Scheduler (BullMQ delayed jobs)
```

### Phase 3 — Threads + Instagram (3 tuần)

```
Tuần 7:  Playwright Browser Manager (shared instance, stealth)
         Threads Publish + Source adapter (Playwright)
Tuần 8:  Instagram Source adapter (instagram-private-api)
         Instagram Publish adapter
Tuần 9:  Session management, checkpoint handling
         Platform health monitoring + auto-pause
```

### Phase 4 — Facebook + Mobile App (4 tuần)

```
Tuần 10: Facebook Source + Publish adapter (Playwright)
Tuần 11: Flutter app: Login, Dashboard, Content list
Tuần 12: Flutter app: Content detail, Link converter, Notifications
Tuần 13: Polish: Cloudflare Tunnel, logging, error alerting
         End-to-end testing tất cả flows
```

**Tổng: ~13 tuần cho 1 developer**

---

## 9. Quyết định chốt

| Quyết định | Chọn |
|------------|------|
| Admin UI | Web Admin (React SPA) |
| TG Admin Chat | Giữ lại song song (notification + legacy) |
| Threads | Playwright trên threads.net |
| Mobile App | Flutter (iOS + Android) |
| Link converter | REST API endpoint |
| Remote access | Cloudflare Tunnel |
| API framework | Fastify (đã có) |
| Realtime | WebSocket qua Fastify |
