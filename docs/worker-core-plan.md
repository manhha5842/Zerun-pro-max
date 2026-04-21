# Kế hoạch xây dựng WORKER CORE

Mục tiêu của kế hoạch này là xây `WORKER CORE` trước, đủ chắc để các phần Web Admin, API endpoint, Mobile App và adapter nền tảng có thể bám vào sau.

## 1. Phạm vi MVP

MVP của Worker Core cần làm được:

- Khởi động BullMQ queues cùng process Fastify.
- Đăng ký processor theo queue.
- Nhận trigger crawl thủ công từ API/service.
- Chạy fake source adapter để tạo content mẫu.
- Chuẩn hóa raw item thành content trong database.
- Detect link trong nội dung tiếng Việt có dấu.
- Resolve routing rule để biết target cần publish.
- Nếu chưa auto publish thì đưa content vào trạng thái chờ duyệt.
- Nếu auto publish thì enqueue publish job.
- Chạy fake publish adapter, ghi `PublishAttempt` và cập nhật trạng thái.
- Emit activity event để API/WebSocket dùng lại.

Chưa làm trong MVP:

- Adapter thật cho Telegram/X/Threads/Instagram/Facebook.
- AI rewrite thật.
- Playwright browser manager thật.
- Cloudinary/media CDN thật.
- Mobile push notification.

## 2. Nguyên tắc thiết kế

- Worker Core không phụ thuộc UI.
- Processor không chứa logic nền tảng cụ thể; mọi chi tiết nền tảng nằm trong adapter.
- Job payload phải nhỏ, chỉ chứa ID và thông tin cần thiết; dữ liệu lớn lấy từ database.
- Mọi processor có thể chạy lại an toàn.
- Trạng thái content và publish attempt là nguồn sự thật, không phải trạng thái BullMQ.
- Fake adapter phải tồn tại từ đầu để test pipeline không cần tài khoản thật.

## 3. Milestone triển khai

### Milestone 0 — Nền dự án

Deliverables:

- Monorepo hoặc workspace Node.js/TypeScript.
- `apps/api` chạy Fastify.
- `packages/db` có Prisma client.
- `packages/shared` có logger, error, event type.
- `packages/worker-core` có entrypoint nhưng chưa xử lý job.
- `docker-compose.yml` cho PostgreSQL và Redis.
- `.env.example` cho database, Redis, JWT, app port.

Acceptance criteria:

- Chạy API health check thành công.
- Prisma migrate chạy được.
- Redis kết nối được.
- Worker Core start/stop không lỗi.

### Milestone 1 — Domain contracts

Deliverables:

- Enum `Platform`, `ContentStatus`, `JobName`, `QueueName`.
- Type `RawSourceItem`, `NormalizedContent`, `PublishInput`, `PublishResult`.
- Adapter contracts: `SourceAdapter`, `PublishAdapter`, `AffiliateAdapter`.
- Error taxonomy: `AdapterAuthError`, `AdapterRateLimitError`, `AdapterCheckpointError`, `UnsupportedMediaError`, `RetryableNetworkError`.
- Fake source adapter và fake publish adapter.

Acceptance criteria:

- Unit test contract cho fake adapter.
- Text mẫu tiếng Việt có dấu không bị lỗi encoding.

### Milestone 2 — Queue foundation

Deliverables:

- `QueueManager`: tạo queue, queue events, add job.
- `WorkerRegistry`: map queue -> processor.
- `WorkerRuntime`: start/stop worker.
- Schema validation cho job payload.
- Retry/backoff config theo queue.
- Graceful shutdown.

Queue MVP:

- `source-crawl`
- `content-process`
- `publish`
- `platform-health`

Acceptance criteria:

- Add job thủ công và worker nhận được job.
- Job fail có retry/backoff.
- Job payload sai bị reject có log rõ.

### Milestone 3 — Crawl pipeline

Deliverables:

- Job `source.crawl`.
- Processor gọi `SourceAdapter.crawl`.
- Dedupe raw item theo `platform + sourceId + externalId`.
- Tạo hoặc cập nhật `Content`.
- Tạo `ActivityLog` khi có content mới.
- Enqueue `content.process`.

Acceptance criteria:

- Trigger crawl fake source tạo content trong database.
- Chạy lại cùng job không tạo trùng content.
- Có log và activity cho batch crawl.

### Milestone 4 — Content processor

Deliverables:

- Job `content.process`.
- Normalize text/media.
- Detect URL trong text.
- Tạo `ContentLink`.
- Resolve routing rule.
- Set status:
  - `waiting_manual_convert` nếu cần admin xử lý link hoặc review.
  - `ready_to_publish` nếu đủ điều kiện auto publish.
  - `scheduled` nếu có lịch.
- Enqueue publish job khi auto publish.

Acceptance criteria:

- Nội dung mẫu `"Deal hôm nay: Áo khoác chống nắng giảm 45%"` giữ nguyên dấu tiếng Việt.
- Link Shopee/Lazada được detect.
- Không có routing rule thì content chờ duyệt, không publish nhầm.

### Milestone 5 — Publish pipeline

Deliverables:

- Job `publish.execute`.
- Fan-out theo `targetId`.
- Gọi `PublishAdapter.publish`.
- Ghi `PublishAttempt`.
- Cập nhật content status theo kết quả target.
- Retry lỗi tạm thời, fail nhanh lỗi auth/checkpoint.
- Emit event `publish:success` và `publish:failed`.

Acceptance criteria:

- Fake publish thành công ghi result URL.
- Publish cùng content/target không tạo attempt trùng ngoài ý muốn.
- Lỗi checkpoint auto-pause target account.

### Milestone 6 — Scheduler

Deliverables:

- Job `schedule.release`.
- API/service tạo delayed job từ `scheduledAt`.
- Khi đến giờ, content chuyển từ `scheduled` sang publish queue.
- Cleanup/resync job khi server restart.

Acceptance criteria:

- Content hẹn giờ publish đúng sau delay.
- Restart app không mất lịch đã lưu trong database.

### Milestone 7 — Health và session state

Deliverables:

- Job `platform.health.check`.
- Adapter `testConnection`.
- Update account health: `healthy`, `degraded`, `checkpoint`, `paused`, `failed`.
- Activity log khi health thay đổi.
- Auto-pause account khi lỗi xác thực/checkpoint.

Acceptance criteria:

- Fake account health được cập nhật.
- Account paused không nhận crawl/publish job mới.

### Milestone 8 — API integration

Deliverables:

- Service API gọi Worker Core:
  - trigger crawl source.
  - retry content.
  - publish now.
  - schedule content.
  - test account.
- WebSocket bridge đọc domain event.
- Dashboard stats lấy từ DB.

Acceptance criteria:

- API trigger crawl tạo job thật.
- API publish now tạo publish job thật.
- WebSocket nhận event content mới và publish result.

## 4. Thiết kế job payload MVP

```ts
type SourceCrawlJob = {
  version: 1;
  sourceId: string;
  requestedBy: "system" | "admin";
  requestedByUserId?: string;
  crawlWindow?: {
    from?: string;
    to?: string;
  };
};

type ContentProcessJob = {
  version: 1;
  contentId: string;
};

type PublishExecuteJob = {
  version: 1;
  contentId: string;
  targetId: string;
  requestedBy: "system" | "admin";
};

type PlatformHealthJob = {
  version: 1;
  accountId: string;
  accountKind: "source" | "target";
};
```

## 5. Database migration đầu tiên cho Worker Core

Ưu tiên các bảng tối thiểu:

- `SourceAccount`
- `TargetAccount`
- `RoutingRule`
- `Content`
- `MediaAsset`
- `ContentLink`
- `PublishAttempt`
- `ActivityLog`
- `WorkerJobLog`
- `PlatformSession`

Các bảng admin auth có thể làm song song trong API layer, nhưng Worker Core MVP cần các bảng trên trước.

## 6. Test strategy

Unit tests:

- Link detector với URL thường gặp và text tiếng Việt.
- Status transition.
- Routing resolver.
- Adapter registry.
- Error classifier.

Integration tests:

- Fake crawl -> content created -> content process.
- Content auto publish -> publish attempt success.
- Publish fail retry.
- Checkpoint error -> account paused.
- Schedule release -> publish job.

Manual smoke tests:

- Start Postgres/Redis.
- Start API + Worker Core.
- Trigger crawl bằng endpoint hoặc script.
- Kiểm tra content trong database.
- Trigger publish now.
- Kiểm tra activity log.

## 7. Rủi ro chính

| Rủi ro | Cách xử lý |
| --- | --- |
| Adapter thật dễ bị checkpoint/rate limit | Tách adapter khỏi Worker Core, dùng fake adapter để ổn định lõi trước |
| Job retry tạo trùng content/publish | Bắt buộc idempotency key và unique index |
| Playwright làm nặng process API | Thiết kế Worker Core có thể tách process sau này |
| Lỗi encoding tiếng Việt | Dùng UTF-8, thêm test tiếng Việt có dấu |
| BullMQ state lệch DB state | DB là nguồn sự thật, BullMQ chỉ là execution layer |

## 8. Sprint đề xuất cho Worker Core

### Sprint 1

- Setup TypeScript workspace.
- Fastify health check.
- Docker compose PostgreSQL/Redis.
- Prisma schema nền.
- Worker runtime start/stop.
- Queue manager và fake adapter.

### Sprint 2

- Crawl pipeline.
- Content processor.
- Link detector.
- Routing resolver.
- Activity log.
- Integration test fake crawl.

### Sprint 3

- Publish pipeline.
- Retry/backoff/error classifier.
- Scheduler delayed job.
- Platform health check.
- API service trigger.
- WebSocket event bridge.

## 9. Definition of Done cho Worker Core MVP

Worker Core MVP hoàn thành khi:

- Một source fake crawl ra content thật trong database.
- Content được xử lý, detect link và resolve routing rule.
- Content có thể chờ duyệt hoặc auto publish theo rule.
- Publish fake ghi attempt và cập nhật status.
- Job retry/backoff hoạt động.
- Account checkpoint/auth error có thể auto-pause.
- API có thể trigger crawl, publish now, schedule và test account.
- Dashboard có thể đọc stats từ database.
- Có test cho tiếng Việt có dấu và pipeline chính.
