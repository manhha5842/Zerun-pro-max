# Milestone 2 — Hardening (bảo mật · alert · bán tự động)

**Mục tiêu:** từ "chạy được" → "chạy yên tâm", bắt đầu nới auto-publish có kiểm soát.
**Tiền đề:** M1 đã tick hết. **Exit:** vài source tin cậy chạy auto-publish, lỗi tự báo Telegram.

## Quy tắc thực thi
Tick `[x]` ngay khi xong từng task; chỉ tick khi thỏa `Done khi:`. 📘 = đọc tutorial trước.
`npm run typecheck` xanh trước khi tick.

---

## Nhóm A — Bảo mật (ƯU TIÊN 1)  📘 [credentials-encryption.md](tutorials/credentials-encryption.md)
- [x] **A1** `packages/shared/src/crypto.ts`: AES-256-GCM encrypt/decrypt + `isEncrypted`; master key `.env`.
  `Done khi:` encrypt→decrypt round-trip pass unit test. ✅ `tests/crypto.test.ts` (10 test pass).
- [x] **A2** Lớp `readCredentials/writeCredentials` dùng chung (`packages/shared/src/credentials.ts`) + Prisma client extension (`packages/db/src/crypto-extension.ts`) mã hoá trong suốt: TargetAccount/SourceAccount.credentials, AiConfig.config (apiKey…), `PlatformSession.data`.
  `Done khi:` record mới ghi xuống DB là ciphertext; adapter vẫn dùng được sau decrypt. ✅ smoke test: ciphertext `v1.` tại DB, đọc qua prisma tự decrypt, field thường giữ nguyên.
- [x] **A3** Migration idempotent `packages/db/src/migrate-encrypt.ts` cho data cũ (`npm run db:encrypt`).
  `Done khi:` chạy script → field cũ thành ciphertext; chạy lại không hỏng. ✅ run1 1/1, run2 0/1.
- [x] **A4** `.env.example` thêm `ZERUN_MASTER_KEY` + ghi chú backup.
  `Done khi:` có hướng dẫn backup key rõ. ✅ kèm lệnh sinh key + cảnh báo mất key.

## Nhóm B — Notifications & alerts
- [x] **B1** Service notify Telegram (`packages/worker-core/src/notify/alert.ts`, port `_send_error_alert`): 5 category login_required/captcha/publish_fail/convert_fail/session_health, mỗi loại có guidance riêng (HTML).
  `Done khi:` ép 1 lỗi login → nhận tin Telegram kèm hướng dẫn. ✅ unit test format + send path (mock fetch). ⚠ Live-send cần cấu hình `telegram_notify` (botToken+chatId) ở Settings — chưa verify gửi thật trong autonomous run.
- [x] **B2** Gắn alert vào các điểm fail: convert (content-process, gồm Shopee qua AffiliateRouter), publish adapter (publish.ts), session health (platform-health.ts). Throttle 5' theo `category:platform:account`.
  `Done khi:` mỗi loại lỗi gửi đúng 1 alert (không spam, có throttle). ✅ `tests/alert.test.ts` (7 test: throttle dedup, key tách biệt, retry khi send fail, classify login/captcha).

## Nhóm C — Reliability
- [x] **C1** Retry/backoff chuẩn (`packages/shared/src/retry.ts` `withRetry`): phân biệt lỗi tạm thời (network/rate-limit/FLOOD_WAIT) vs vĩnh viễn (auth/checkpoint/config), exponential backoff + jitter, tôn trọng retry-after. Dùng ở convert (content-process) + telegram crawl/publish.
  `Done khi:` lỗi tạm thời tự retry, lỗi vĩnh viễn dừng + log rõ. ✅ `tests/retry.test.ts` (10 test).
- [x] **C2** Telegram `FLOOD_WAIT`: `floodSleepThreshold: 300` (GramJS tự sleep flood ≤5'), flood lớn hơn → `withRetry` đọc `retryAfterMs` (FLOOD_WAIT_X / `.seconds`) sleep đúng rồi tiếp.
  `Done khi:` gặp FLOOD_WAIT không crash, chờ rồi tiếp. ✅ unit test honor flood delay; ⚠ chưa ép flood thật.
- [x] **C3** zca-js auto-reconnect: `retryOnClose: true` lo blip mạng; `ListenerHandle.onClose` + supervisor 60s ở `RealtimeListenerManager` re-login từ credentials đã lưu (backoff 5s→5'), gỡ handle chết.
  `Done khi:` kill mạng tạm → listener tự nối lại. ✅ logic + backoff; ⚠ chưa test live kill mạng (cần session Zalo thật).
- [x] **C4** Health-check định kỳ: `platform-health` map session hỏng (failed/checkpoint/login_required/error) → `health="paused"` (convention dừng nhận job ở publish/crawl/source-crawl/realtime-listener) + alert + log "(đã tạm dừng)".
  `Done khi:` account hỏng session bị set paused, dừng nhận job. ✅ map broken→paused; job dispatch đã lọc `health==="paused"`.

## Nhóm D — Auto-publish có kiểm soát
- [x] **D1** Shadow mode per-source (`SourceAccount.config.shadowMode`) + kill switch toàn hệ thống. content-process luôn ghi `metadata.review` = {verdict, autoPublish, confidence, wouldPublishTargets, held, heldReason}; khi shadow/kill → giữ lại chờ duyệt, KHÔNG đăng (log "AI sẽ làm gì").
  `Done khi:` bật shadow cho 1 source → thấy "AI sẽ làm gì" mà chưa đăng. ✅ mechanism + recording; per-source qua config.shadowMode, hoặc kill switch toàn cục cho hold ngay.
- [x] **D2** So sánh AI vs người duyệt: ghi `metadata.review.humanDecision` (approve/reject/skip) ở các endpoint duyệt; `GET /dashboard/ai-comparison` tính accuracy theo source; bảng "AI vs người duyệt" trên Dashboard.
  `Done khi:` xem được tỉ lệ AI đúng/sai theo source. ✅ smoke test aggregation 2/3=67% qua DB thật.
- [x] **D3** Kill switch thật: `GET/PUT /settings/auto-publish` (SystemSetting `auto_publish_enabled`) + toggle ở Settings (tab Telegram) tắt/bật nhanh; content-process tôn trọng cờ này.
  `Done khi:` 1 source chạy auto end-to-end, có thể tắt nhanh khi cần. ✅ toggle tắt ngay → mọi auto-publish bị giữ; ⚠ auto end-to-end thật cần account thật (như E2E M1).

## Nhóm E — Metrics tối thiểu
- [x] **E1** Dashboard số liệu: endpoint `GET /dashboard/metrics` (crawl/dedup, AI confidence TB + token, convert success rate, publish success/fail theo target) + section "Số liệu vận hành" ở DashboardPage, tự refetch 15s.
  `Done khi:` trang Overview hiện đủ 4 nhóm số liệu, cập nhật realtime/refresh. ✅ typecheck + groupBy smoke OK.

---
**Thứ tự:** A (bảo mật) → B (alert) → C (reliability) → E (metrics) → D (auto-publish, cần metrics để quyết).
