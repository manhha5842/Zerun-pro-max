# AGENTS.md - Hướng dẫn cho AI agent trong Zerun Pro Max

Tài liệu này là bản đồ làm việc cho AI agent khi đọc, sửa, kiểm thử hoặc mở rộng source code của dự án `Zerun-pro-max`. Luôn ưu tiên hiểu ngữ cảnh repo trước khi sửa code, giữ tiếng Việt có dấu, và không làm mất các thay đổi đang có của người dùng.

## 1. Quy tắc ngôn ngữ và đầu ra

- Khi task liên quan đến UI, nội dung, nhãn, thông báo, docs, comment hoặc test data tiếng Việt, luôn dùng tiếng Việt tự nhiên với đầy đủ dấu.
- Không bao giờ tự ý bỏ dấu tiếng Việt.
- Ưu tiên UTF-8 cho mọi file chứa tiếng Việt.
- Khi sửa i18n/localization, giữ câu tiếng Việt đầy đủ, rõ nghĩa, không dịch máy.
- Nếu thư viện, database, API, terminal hoặc format file có nguy cơ làm hỏng dấu tiếng Việt, dừng lại và báo rõ rủi ro trước khi thay đổi dữ liệu.
- Khi phù hợp, thêm hoặc giữ ít nhất một test/example có tiếng Việt với dấu, ví dụ: `Deal hôm nay: Áo khoác chống nắng giảm 45%, freeship toàn quốc.`
- Giải thích cho người dùng bằng tiếng Việt, trừ khi người dùng yêu cầu ngôn ngữ khác.
- Code comment có thể dùng tiếng Anh, trừ khi khu vực code hiện có đang dùng comment tiếng Việt.

## 2. Mục tiêu sản phẩm và nghiệp vụ

Zerun là hệ thống local-first để tự động hóa nội dung affiliate/social:

- Thu thập nội dung từ nhiều nguồn như Zalo, Telegram, X/Twitter, Threads, Instagram, Facebook.
- Chuẩn hóa nội dung, media, link và trạng thái xử lý.
- Phát hiện, khử trùng lặp và chuyển đổi link affiliate, ưu tiên Shopee/Lazada và mở rộng qua adapter.
- Cho phép admin duyệt, chỉnh sửa, gom nhóm, lên lịch hoặc publish ngay.
- Repost sang nhiều kênh/target theo flow, rule và trạng thái tài khoản.
- Theo dõi lịch sử, lỗi, worker jobs, queue comment, health của platform/session và activity realtime.

Các luồng nghiệp vụ chính:

```text
Nguồn nội dung
  -> crawl hoặc realtime listener
  -> raw item / crawl result
  -> normalize và group content
  -> detect link / dedup / convert affiliate
  -> routing flow hoặc review queue
  -> schedule hoặc publish
  -> publish attempt / comment queue
  -> history, activity log, dashboard realtime
```

Khi sửa nghiệp vụ, luôn xác định màn hình web, API route, model Prisma, worker processor và adapter liên quan trước.

## 3. Kiến trúc tổng quan

Dự án là npm workspace TypeScript:

```text
apps/
  api/          Fastify API, auth, REST routes, WebSocket, static web serving
  web-admin/    React + Vite admin UI

packages/
  shared/       type chung, API response, logger, retry, crypto, runtime config
  core/         domain logic thuần: content, link, routing, rule engine, AI schemas
  db/           Prisma schema, client, seed, encryption migration
  adapters/     platform adapters, affiliate adapters, session/profile helpers
  worker-core/  local/Redis queues, processors, scheduler, realtime listeners

docs/           roadmap, milestone plans, tutorial kỹ thuật, tài liệu kiến trúc
tests/          Vitest contract/unit tests
extensions/     browser extension và tooling liên quan nếu có
runtime/        dữ liệu runtime local, không coi là source nghiệp vụ chính
```

Ranh giới quan trọng:

- `apps/api` được phép điều phối request, validate input, gọi Prisma và enqueue worker job.
- `packages/worker-core` xử lý tác vụ dài, retry, schedule, publish, crawl, comment và health check.
- `packages/core` chứa logic thuần, không phụ thuộc Fastify, Prisma, BullMQ, Playwright hoặc browser.
- `packages/adapters` là nơi duy nhất biết chi tiết nền tảng ngoài: Telegram, Zalo, Facebook, Instagram, Threads, X, affiliate API.
- `packages/db` là nguồn sự thật cho schema dữ liệu. Khi đổi model, cập nhật Prisma schema, API mapping, worker và test liên quan.
- `apps/web-admin` chỉ nên gọi API qua helper trong `src/api/client.ts`, tránh nhúng URL hoặc fetch rải rác.

## 4. Bản đồ source code cần nhớ

### API

- Entry server: `apps/api/src/server.ts`
- App factory, route registration và phần lớn REST API: `apps/api/src/app.ts`
- Config/env/runtime paths: `apps/api/src/config.ts`
- Extension bridge: `apps/api/src/zerun-extension-bridge.ts`
- Storage runtime: `apps/api/storage/*`

Các route chính trong `app.ts`:

- Auth: `/api/v1/auth/login`, `/refresh`, `/logout`
- Dashboard/activity/WebSocket: `/api/v1/dashboard/*`, `/api/v1/ws`
- Content: `/api/v1/contents/*`, `/api/v1/content-links`
- Crawl: `/api/v1/crawl-jobs`, `/api/v1/crawl-results`
- Auto conversion: `/api/v1/auto-conversion/*`
- Convert link tool: `/api/v1/tools/convert-link/*`
- Sources/targets/routing: `/api/v1/sources`, `/targets`, `/routing-rules`
- Accounts/session/health: `/api/v1/accounts/*`, `/api/v1/health/platforms`
- Repost setup: `/api/v1/connected-accounts`, `/channel-options`, `/channels`, `/repost-flows`
- Facebook campaign/post/comment: `/api/v1/facebook/*`, `/pending-comments`
- Settings: `/api/v1/settings/*`
- Worker jobs/history/failed: `/api/v1/worker-jobs`, `/history`, `/failed`

`apps/api/src/app.ts` hiện là file lớn. Trước khi sửa route, dùng `rg "function registerX"` hoặc `rg '"/route-name" apps/api/src/app.ts'` để đến đúng cụm hàm.

### Web Admin

- App routes: `apps/web-admin/src/App.tsx`
- API helper: `apps/web-admin/src/api/client.ts`
- Layout/navigation: `apps/web-admin/src/components/Layout.tsx`
- Design tokens: `apps/web-admin/src/design-system.ts`
- Global CSS and layout primitives: `apps/web-admin/src/styles.css`
- Base UI primitives: `apps/web-admin/src/components/ui`
- Feature pages: `apps/web-admin/src/pages`
- Affiliate service helper: `apps/web-admin/src/services/affiliateService.ts`

Các màn hình đáng chú ý:

- Dashboard: `DashboardPage.tsx`
- Content/review/archive/trash/composer: `ContentsPage.tsx`, `ContentDetailPage.tsx`, `ContentCollectionsPage.tsx`, `PostComposerPage.tsx`
- Repost flow/review/manual/history: `RepostFlowPage.tsx`, `RepostReviewQueuePage.tsx`, `RepostManualLinksPage.tsx`, `RepostHistoryPage.tsx`
- Crawl: `CrawlPages.tsx`, `CrawlDataPage.tsx`
- Convert link: `ConvertLinkToolPage.tsx`, `QuickConvertLinkPage.tsx`
- Accounts/channels/login sessions: `ChannelsManagementPage.tsx`, `AccountsManagementPage.tsx`, `accountForms.tsx`
- Settings: `SetupSettingsPages.tsx`, `AffiliateSettingsPage.tsx`, `SettingsPage.tsx`
- Operations: `HistoryPage.tsx`, `WorkerJobsPage.tsx`, `FailedPage.tsx`, `PendingCommentsPage.tsx`

### Core domain

- Content status/caption/sanitize/grouping: `packages/core/src/content`
- Link detect/dedup: `packages/core/src/links`
- Routing: `packages/core/src/routing/resolve.ts`
- Rule engine/source profile/glossary: `packages/core/src/rules`
- AI context, schemas, decision, provider contracts: `packages/core/src/ai`

Giữ domain logic tại đây nếu logic có thể test độc lập và dùng lại giữa API/worker.

### Worker Core

- Queue/job names và Zod job schemas: `packages/worker-core/src/types.ts`
- Runtime local/Redis queues, worker lifecycle, enqueue API: `packages/worker-core/src/runtime.ts`
- Processors: `packages/worker-core/src/processors`
- AI provider factory/system prompt: `packages/worker-core/src/ai`
- Alerts: `packages/worker-core/src/notify/alert.ts`

Queue hiện có:

- `crawl`
- `source-crawl`
- `content-process`
- `link-convert`
- `publish`
- `schedule`
- `platform-health`
- `maintenance`
- `fb-post`
- `comment`

Worker có hai chế độ:

- `ZERUN_QUEUE_MODE=local` dùng in-memory local queue, phù hợp dev local.
- `ZERUN_QUEUE_MODE=redis` dùng BullMQ + Redis, phù hợp vận hành dài hạn.

### Adapters

- Contract adapter: `packages/adapters/src/contracts.ts`
- Registry adapter thật: `packages/adapters/src/registry.ts`
- Platform adapters: `packages/adapters/src/platforms`
- Affiliate adapters: `packages/adapters/src/affiliate`
- Session/profile helpers: `packages/adapters/src/session`
- Credential/playwright utils: `packages/adapters/src/utils`

Nguyên tắc: adapter không tự quyết định workflow tổng thể. Adapter trả kết quả cho worker/API, còn worker/API cập nhật database và trạng thái.

### Database

- Prisma schema: `packages/db/prisma/schema.prisma`
- Prisma client/runtime helpers: `packages/db/src/client.ts`
- Encryption extension: `packages/db/src/crypto-extension.ts`
- Seed: `packages/db/src/seed.ts`

Các model chính gồm `AdminUser`, `RefreshToken`, `SourceAccount`, `TargetAccount`, `PlatformSession`, `RoutingRule`, `PlatformChannel`, `RepostFlow`, `Content`, `AutoConversionRule`, `CrawlJob`, `CrawlResult`, `MediaAsset`, `ContentLink`, `PublishAttempt`, `Schedule`, `WorkerJobLog`, `ActivityLog`, `AiConfig`, `SystemSetting`, `FbCampaign`, `FbPost`, `CommentQueue`, `FbExecution`.

## 5. Luồng code theo nghiệp vụ

### Thêm hoặc sửa màn hình admin

1. Tìm route ở `apps/web-admin/src/App.tsx`.
2. Tìm page tương ứng trong `apps/web-admin/src/pages`.
3. Tìm API call trong page hoặc helper `apps/web-admin/src/api/client.ts`.
4. Tìm endpoint tương ứng trong `apps/api/src/app.ts`.
5. Nếu thêm field, kiểm tra Prisma model và type shared/core liên quan.
6. Dùng UI primitives sẵn có trước khi tạo component mới.

### Thêm hoặc sửa API

1. Tìm cụm `register...Routes` trong `apps/api/src/app.ts`.
2. Dùng Zod hoặc validation hiện có cho request body/query nếu route có dữ liệu phức tạp.
3. Trả response theo helper success/error hiện có, không tạo shape response lạ.
4. Với tác vụ dài hoặc có retry, enqueue qua `createWorkerCore` thay vì xử lý trực tiếp trong request.
5. Nếu route phục vụ UI, cập nhật client/page và test contract nếu có.

### Thêm hoặc sửa worker processor

1. Kiểm tra `packages/worker-core/src/types.ts` để giữ job schema có version.
2. Tìm enqueue function trong `packages/worker-core/src/runtime.ts`.
3. Sửa processor trong `packages/worker-core/src/processors`.
4. Ghi `WorkerJobLog`, `ActivityLog` hoặc trạng thái domain nếu flow hiện có đang làm như vậy.
5. Đảm bảo idempotency: retry không tạo trùng content, media, publish attempt hoặc comment.

### Thêm platform hoặc affiliate adapter

1. Định nghĩa contract hoặc dùng contract hiện có trong `packages/adapters/src/contracts.ts`.
2. Implement trong `packages/adapters/src/platforms` hoặc `packages/adapters/src/affiliate`.
3. Đăng ký trong `packages/adapters/src/registry.ts`.
4. Cập nhật platform/type shared nếu cần.
5. Cập nhật worker processor/API/account settings để gọi adapter mới.
6. Thêm test hoặc fake data có tiếng Việt nếu adapter ảnh hưởng nội dung text.

### Sửa database/schema

1. Sửa `packages/db/prisma/schema.prisma`.
2. Chạy `npm run prisma:generate`.
3. Nếu cần migration dev, chạy `npm run prisma:migrate`.
4. Cập nhật seed, API mapping, UI type, worker logic và test.
5. Không tự ý xóa dữ liệu runtime hoặc migration cũ nếu người dùng chưa yêu cầu.

## 6. Trạng thái và thuật ngữ domain

Content status chung nằm trong `packages/shared/src/types.ts` và logic ở `packages/core/src/content/status.ts`.

Các trạng thái cần hiểu:

- `discovered`: mới phát hiện/crawl.
- `processing`: đang chuẩn hóa/xử lý.
- `waiting_link_convert`: cần chuyển link tự động.
- `waiting_manual_convert`: cần admin xử lý link thủ công.
- `ready_to_publish`: sẵn sàng publish.
- `scheduled`: đã lên lịch.
- `publishing`: đang publish.
- `published`: đã publish thành công.
- `failed`: lỗi không tự hồi phục.
- `skipped`: bỏ qua.
- `rejected`: từ chối.
- `duplicate`: nội dung trùng.

Platform hiện có trong shared:

- `telegram`
- `x`
- `threads`
- `instagram`
- `facebook`
- `zalo-personal`

Link network hiện có:

- `shopee`
- `lazada`
- `tiki`
- `sendo`
- `tiktok_shop`
- `unknown`

## 7. Lệnh phát triển và kiểm thử

Chạy từ root repo:

```powershell
npm run dev
npm run dev:api
npm run dev:web
npm run build
npm run build:web
npm run typecheck
npm run test
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
npm run db:encrypt
```

Lệnh workspace:

```powershell
npm run build -w @zerun/web-admin
npm run dev -w @zerun/web-admin
npm run dev -w @zerun/api
```

Trước khi kết luận task code đã xong:

- Chạy `npm run typecheck` khi đổi TypeScript cross-package.
- Chạy `npm run test` hoặc test file liên quan khi sửa core logic, worker, API contract hoặc encoding.
- Chạy `npm run build -w @zerun/web-admin` khi sửa UI/build config.
- Nếu không chạy được test vì môi trường thiếu dependency/service, báo rõ lệnh đã thử và lý do.

## 8. Công thức tìm kiếm code bằng `rg`

Ưu tiên `rg` trước `grep` hoặc tìm tay.

Tìm route API:

```powershell
rg -n '"/contents|registerContentRoutes|contents/:code' apps/api/src/app.ts
rg -n '"/repost-flows|registerRepostApiRoutes' apps/api/src/app.ts
rg -n '"/settings/ai|registerAiSettingsRoutes' apps/api/src/app.ts
```

Tìm màn hình/route web:

```powershell
rg -n 'Route path|RepostFlowPage|ConvertLinkToolPage' apps/web-admin/src
rg -n 'api(Get|Post|Put|Delete)\(' apps/web-admin/src/pages apps/web-admin/src/services
```

Tìm model/database:

```powershell
rg -n '^model Content|^model RepostFlow|^model PlatformChannel' packages/db/prisma/schema.prisma
rg -n 'prisma\.content|prisma\.repostFlow|prisma\.platformChannel' apps packages tests
```

Tìm domain logic:

```powershell
rg -n 'contentStatuses|ready_to_publish|waiting_manual_convert' packages apps tests
rg -n 'detectLinks|dedup|convert' packages/core packages/adapters packages/worker-core apps/api/src
rg -n 'resolveRouting|RoutingRule|RepostFlow' packages apps tests
```

Tìm worker/queue:

```powershell
rg -n 'QueueName|JobName|publishNow|processContent|scheduleRelease' packages/worker-core/src
rg -n 'processPublish|processSourceCrawl|processComment' packages/worker-core/src/processors
```

Tìm adapter/platform:

```powershell
rg -n 'class .*Adapter|registerSource|registerPublish|getPublish|getSource' packages/adapters/src
rg -n 'zalo-personal|telegram|facebook|instagram|threads|x' packages/adapters/src packages/shared/src
```

Tìm text tiếng Việt hoặc nguy cơ encoding:

```powershell
rg -n 'á|à|ả|ã|ạ|ă|â|đ|ê|ô|ơ|ư|Đ' apps packages tests docs
rg -n 'Ä|Ã|Â|áº|á»' apps packages tests docs
```

## 9. Quy tắc sửa code

- Không revert hoặc xóa thay đổi của người dùng nếu không được yêu cầu.
- Kiểm tra `git status --short` trước khi sửa nhiều file.
- Giữ scope thay đổi hẹp theo task.
- Ưu tiên pattern có sẵn trong repo hơn tạo abstraction mới.
- Không thêm dependency mới nếu có thể dùng package hiện có.
- Không hardcode secret, token, cookie, session, đường dẫn cá nhân hoặc credential vào source.
- Không ghi log credential, cookie, JWT, refresh token hoặc nội dung nhạy cảm.
- Với tác vụ có side effect ngoài hệ thống như publish, crawl thật, login session, xóa data, phải hiểu rõ flow và tránh chạy lệnh ngoài ý muốn.
- Không chỉnh file generated như `dist`, cache, runtime session trừ khi task yêu cầu rõ.
- Khi đổi behavior user-facing, cập nhật UI, API, worker và test tương ứng.

## 10. Figma Design System Rules

Các quy tắc này áp dụng khi có thiết kế Figma được đưa vào repository.

### Project structure

- Admin web UI lives in `apps/web-admin`.
- Shared design tokens are defined in `apps/web-admin/src/design-system.ts`.
- Global UI tokens and layout primitives are exposed in `apps/web-admin/src/styles.css`.
- Base UI components live in `apps/web-admin/src/components/ui`.
- Feature-level composition belongs in `apps/web-admin/src/components/common` or `apps/web-admin/src/pages`.

### Styling and token rules

- IMPORTANT: Reuse existing CSS variables in `apps/web-admin/src/styles.css` before adding new values.
- IMPORTANT: If a Figma value introduces a new foundation token, add it to both `apps/web-admin/src/design-system.ts` and `apps/web-admin/src/styles.css`.
- Prefer semantic tokens like `--color-primary`, `--color-border`, `--space-*`, `--radius-*` instead of raw hex, pixel, or rgba values in components.
- Tailwind utility classes may be used inside TSX, but they must resolve to the same semantic token system already used by the app.
- New page sections should reuse `panel`, `page-head`, `form-grid`, `actions`, and other existing layout primitives before inventing one-off wrappers.

### Component rules

- IMPORTANT: Check `apps/web-admin/src/components/ui` for an existing primitive before creating a new Figma-derived component.
- Prefer extending `Button`, `Input`, `Select`, `Textarea`, `Badge`, `Dialog`, and `Label` rather than duplicating them.
- New reusable Figma-derived primitives should be placed in `apps/web-admin/src/components/ui` and exported with PascalCase names.
- Keep component props typed with TypeScript and favor small composable APIs over page-specific prop shapes.
- Avoid inline styles unless the value is truly dynamic and cannot be expressed through existing tokens or utility classes.

### Icon system rules

- The referenced Figma file currently maps to a Vuesax-style icon system with style families `linear`, `outline`, `bold`, `twotone`, `bulk`, and `broken`.
- IMPORTANT: For admin navigation and shared controls, prefer the local icon wrapper in `apps/web-admin/src/components/ui/Icon.tsx` over direct third-party icon usage.
- Keep icon sizes on the established scale from `apps/web-admin/src/design-system.ts`.
- Default admin usage should prefer the `linear` style unless a screen explicitly needs a different set.

### Figma MCP workflow

1. Parse the Figma URL and identify the exact node being implemented.
2. Run `get_design_context` for the target node. If it fails or the response is too large, run `get_metadata` and narrow implementation to specific child nodes.
3. Run `get_screenshot` for visual validation before coding.
4. Translate the Figma structure into the existing React + Tailwind + CSS-variable conventions of `apps/web-admin`.
5. Validate spacing, typography, icon size, and state colors against the screenshot before finishing.

### Asset and dependency rules

- IMPORTANT: Do not add a new icon package when the design can be represented by the local icon system or assets returned from Figma.
- Store any future Figma-exported assets under the app workspace in a stable location and reference them consistently.
- Avoid large dependency additions for purely visual changes unless the user explicitly asks for them.

### Current integration scope

- The shared Figma node `58:1461` resolves to the `Icons` canvas overview rather than the full 6000-component library.
- Treat this Figma reference as the source of truth for icon style direction, not as proof that button, form, card, table, or layout components should be regenerated wholesale.
- If future work targets a specific button, input, modal, card, or page frame, fetch that exact node before implementing or restyling those components.

## 11. Tài liệu tham khảo trong repo

- Tổng quan kiến trúc: `docs/project-architecture.md`
- Roadmap/index: `docs/roadmap.md`
- Kế hoạch nâng cấp thống nhất: `docs/unified-upgrade-plan.md`
- Worker core plan: `docs/worker-core-plan.md`
- Platform automation roadmap: `docs/platform-automation-roadmap.md`
- Milestones: `docs/milestone-1-implementation-plan.md` đến `docs/milestone-4-implementation-plan.md`
- Tutorials kỹ thuật: `docs/tutorials/*`
- Reference bot cũ: `docs/reference-shopee-seeding-bot.md`
- Checklist/setup: `docs/repost-setup-readiness-checklist.md`, `IMPLEMENTATION_CHECKLIST.md`, `IMPLEMENTATION_NOTES.md`, `IMPLEMENTATION_RULES.md`

Nếu docs bị hiển thị mojibake trong terminal, kiểm tra encoding trước khi kết luận nội dung file hỏng. Không tự ý chuyển encoding hàng loạt khi chưa có yêu cầu.
