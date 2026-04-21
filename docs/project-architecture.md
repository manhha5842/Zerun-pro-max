# Kiến trúc dự án Zerun

Tài liệu này được rút ra từ `zerun-web-admin-api-mobile.md` và dùng làm bản kiến trúc nền để bắt đầu triển khai dự án. Ưu tiên đầu tiên là `WORKER CORE`, vì đây là lõi xử lý crawl, chuẩn hóa nội dung, chuyển link, lên lịch và publish đa nền tảng.

## 1. Mục tiêu hệ thống

Zerun là hệ thống quản trị và tự động hóa nội dung affiliate/social gồm:

- Crawl nội dung từ nhiều nguồn: Telegram, X/Twitter, Threads, Instagram, Facebook.
- Chuẩn hóa nội dung, media, link và trạng thái xử lý.
- Chuyển đổi link affiliate qua REST API và worker pipeline.
- Cho phép admin duyệt, sửa, lên lịch hoặc publish ngay.
- Publish sang nhiều target theo rule.
- Theo dõi sức khỏe nền tảng, log hoạt động và realtime event.

## 2. Kiến trúc runtime

Phiên bản đầu chạy `REST API` và `WORKER CORE` chung một process Fastify để giảm độ phức tạp vận hành.

```text
Clients
  Web Admin / Flutter App / TG Admin legacy
        |
        v
Fastify App
  REST API / WebSocket / Auth / Admin endpoints
        |
        v
Worker Core
  BullMQ queues / processors / scheduler / adapter registry
        |
        v
Infrastructure
  PostgreSQL / Redis / Playwright browser / media storage
        |
        v
Platform Adapters
  Telegram / X / Threads / Instagram / Facebook
```

Thiết kế phải cho phép tách Worker Core ra process riêng sau này mà không phải viết lại domain logic. API gọi Worker Core qua service interface, còn Worker Core giao tiếp database và queue qua các package chung.

## 3. Cấu trúc source đề xuất

```text
apps/
  api/
    src/
      server.ts
      app.ts
      config/
      modules/
        auth/
        dashboard/
        contents/
        sources/
        targets/
        routing-rules/
        links/
        schedules/
        accounts/
        ai/
        realtime/
      worker-runtime/
        start-workers.ts
        register-workers.ts
  web-admin/
  mobile/

packages/
  db/
    prisma/
    src/
      client.ts
      repositories/
  shared/
    src/
      result.ts
      pagination.ts
      errors.ts
      logger.ts
      events.ts
  core/
    src/
      content/
      media/
      links/
      routing/
      platforms/
  worker-core/
    src/
      queues/
      jobs/
      processors/
      scheduler/
      registry/
      lifecycle/
      telemetry/
  adapters/
    src/
      telegram/
      x/
      threads/
      instagram/
      facebook/
      affiliate/
```

Giai đoạn đầu có thể chỉ tạo `apps/api`, `packages/db`, `packages/shared`, `packages/core`, `packages/worker-core` và adapter fake để test pipeline. Adapter thật sẽ bổ sung theo từng nền tảng.

## 4. Ranh giới module

### API Layer

API Layer chịu trách nhiệm:

- Xác thực JWT và refresh token.
- Validate request/response.
- CRUD admin cho source, target, routing rule, content, schedule, account.
- Trigger thủ công các job: crawl, retry, publish, schedule.
- Expose WebSocket event cho Web Admin và Mobile App.

API Layer không tự crawl/publish trực tiếp. Mọi tác vụ dài hoặc có retry phải đưa vào Worker Core.

### Worker Core

Worker Core chịu trách nhiệm:

- Quản lý BullMQ queue và worker lifecycle.
- Định nghĩa job contract có version.
- Điều phối pipeline crawl, process content, convert link, schedule, publish.
- Gọi adapter registry để lấy source/publish adapter phù hợp.
- Ghi trạng thái vào database theo transaction khi cần.
- Emit domain event cho activity log và WebSocket.
- Retry, backoff, idempotency và dead-letter handling.

### Core Domain

Core Domain chứa logic thuần:

- Chuẩn hóa content và media.
- Detect link trong text.
- Tính routing target từ source và routing rule.
- Quyết định trạng thái kế tiếp của content.
- Chuẩn hóa lỗi adapter thành lỗi hệ thống.

Core Domain không phụ thuộc Fastify, BullMQ, Playwright hoặc Prisma trực tiếp.

### Adapter Layer

Adapter Layer là phần duy nhất biết chi tiết từng nền tảng:

- Telegram: GramJS.
- X/Twitter: `agent-twitter-client`.
- Threads: Playwright persistent context.
- Instagram: `instagram-private-api` và Playwright fallback.
- Facebook: Playwright + stealth.
- Affiliate network: AccessTrade hoặc adapter tương đương.

Adapter không tự ghi database. Adapter trả kết quả về Worker Core để Worker Core quyết định lưu trạng thái.

## 5. Worker Core pipeline

```text
source.crawl
  -> raw-item.process
  -> content.normalize
  -> media.ingest
  -> links.detect
  -> routing.resolve
  -> content.ready-or-waiting
  -> publish.enqueue hoặc manual review
  -> publish.execute
  -> publish.result
  -> activity + realtime event
```

Các bước cần idempotent để khi retry không tạo trùng content, media hoặc publish attempt.

## 6. Queue đề xuất

| Queue | Mục đích |
| --- | --- |
| `source-crawl` | Crawl source theo lịch hoặc trigger thủ công |
| `content-process` | Chuẩn hóa raw item thành content nội bộ |
| `link-convert` | Detect và chuyển link affiliate |
| `publish` | Publish content sang target |
| `schedule` | Đánh thức content đã lên lịch |
| `platform-health` | Kiểm tra account/session/adapter health |
| `maintenance` | Cleanup, retry stale job, compact log |

Mỗi job cần có `jobId` ổn định để chống trùng:

```text
crawl:{sourceId}:{windowStart}
raw:{platform}:{sourceId}:{externalId}
publish:{contentId}:{targetId}:{attemptNo}
schedule:{scheduleId}
health:{accountId}
```

## 7. Contract adapter

```ts
type Platform = "telegram" | "x" | "threads" | "instagram" | "facebook";

interface SourceAdapter {
  platform: Platform;
  testConnection(accountId: string): Promise<AdapterHealth>;
  crawl(input: CrawlInput): Promise<CrawlResult>;
}

interface PublishAdapter {
  platform: Platform;
  testConnection(accountId: string): Promise<AdapterHealth>;
  publish(input: PublishInput): Promise<PublishResult>;
}
```

Kết quả crawl nên trả về dữ liệu thô đã chuẩn hóa tối thiểu:

```ts
interface RawSourceItem {
  platform: Platform;
  sourceId: string;
  externalId: string;
  author?: string;
  text: string;
  media: RawMedia[];
  originalUrl?: string;
  postedAt?: Date;
  metadata?: Record<string, unknown>;
}
```

Ví dụ text test phải giữ tiếng Việt có dấu:

```text
Deal hôm nay: Áo khoác chống nắng giảm 45%, freeship toàn quốc.
```

## 8. Trạng thái content

```text
discovered
processing
waiting_link_convert
waiting_manual_convert
ready_to_publish
scheduled
publishing
published
failed
skipped
rejected
```

Quy tắc cơ bản:

- Content mới crawl vào `discovered`.
- Sau normalize thành công chuyển `processing`.
- Nếu có link cần chuyển nhưng chưa chuyển được: `waiting_link_convert`.
- Nếu cần admin sửa/dán link: `waiting_manual_convert`.
- Nếu đủ target và không cần duyệt: `ready_to_publish`.
- Nếu có `scheduledAt`: `scheduled`.
- Khi publish từng target: tạo `PublishAttempt`, content có thể ở `publishing`.
- Khi tất cả target thành công: `published`.
- Khi lỗi không thể tự hồi phục: `failed`.

## 9. Data model cần ưu tiên

Các model cần có trước khi code Worker Core:

- `AdminUser`, `RefreshToken`.
- `SourceAccount`: nền tảng, credential/session config, crawl config, health.
- `TargetAccount`: nền tảng, credential/session config, publish config, health.
- `RoutingRule`: source -> target, auto publish, dùng AI, cần duyệt.
- `Content`: code, source, text gốc, draft/final text, status, scheduledAt.
- `MediaAsset`: content media, local path, CDN URL, mime type, checksum.
- `ContentLink`: original URL, converted URL, network, status.
- `WorkerJobLog`: queue/job name, status, error, timestamps.
- `PublishAttempt`: content, target, attempt no, result URL, error.
- `ActivityLog`: message/event cho dashboard.
- `PlatformSession`: cookie/session path, checkpoint status, expiry.

## 10. Reliability

- Dùng idempotency key cho crawl item và publish attempt.
- Dùng retry có backoff theo loại lỗi.
- Lỗi checkpoint/login/session phải auto-pause account, không retry vô hạn.
- Lỗi network tạm thời có thể retry.
- Lỗi validation hoặc unsupported media phải chuyển content sang manual review.
- Job payload phải validate bằng schema trước khi xử lý.
- Worker shutdown phải graceful: đóng BullMQ worker, queue events, browser context.

## 11. Observability

- Structured log theo `requestId`, `jobId`, `contentId`, `platform`, `sourceId`, `targetId`.
- Mỗi chuyển trạng thái quan trọng tạo `ActivityLog`.
- WebSocket event phát từ domain event, không phát trực tiếp rải rác trong processor.
- Dashboard lấy số liệu từ database, không phụ thuộc memory của worker.

## 12. Thứ tự xây dựng

1. Tạo nền TypeScript/Fastify/Prisma/BullMQ.
2. Tạo domain types, error model, result helpers.
3. Tạo Worker Core với fake adapter và queue thật.
4. Hoàn thiện crawl -> normalize -> manual review pipeline.
5. Thêm link detection/conversion.
6. Thêm publish pipeline với fake adapter.
7. Tích hợp API trigger và WebSocket event.
8. Sau khi Worker Core ổn, mới thêm adapter thật theo thứ tự Telegram, X, Threads, Instagram, Facebook.
