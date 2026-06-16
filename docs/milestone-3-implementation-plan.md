# Milestone 3 — Mở rộng độ phủ (nhiều target · vision · nhiều network)

**Mục tiêu:** một deal fan-out ra nhiều nền tảng với caption phù hợp; xử lý được tin có ảnh.
**Tiền đề:** M2 đã tick hết (bảo mật + alert). **Exit:** 1 deal đăng đồng thời Telegram+Zalo+FB/Threads/X.

## Quy tắc thực thi
Tick `[x]` ngay khi xong; chỉ tick khi thỏa `Done khi:`. 📘 = đọc tutorial trước. typecheck xanh.

---

## Nhóm A — Thêm publish targets (adapter đã có)
- [ ] **A1** Facebook page/group publish: wire routing + session (Playwright profile từ M1·0).
  `Done khi:` đăng 1 bài lên FB group/page thật, có PublishAttempt + screenshot khi lỗi.
- [ ] **A2** Threads publish.
  `Done khi:` đăng 1 bài Threads thật.
- [ ] **A3** X publish.
  `Done khi:` đăng 1 bài X thật.
- [x] **A4** Caption template theo từng nền tảng (`packages/core/src/content/caption.ts` `formatCaptionForPlatform`): giới hạn ký tự mỗi platform (X 280, Threads 500, IG 2200, FB/Telegram dài), cắt ở ranh giới từ + giữ link affiliate. Wire ở `publish.ts` trước khi gửi adapter.
  `Done khi:` cùng 1 deal ra caption khác nhau hợp lệ cho Telegram vs X vs FB. ✅ `tests/caption.test.ts` (6 test).

## Nhóm B — Vision/OCR  📘 [vision-ocr.md](tutorials/vision-ocr.md)
- [ ] **B1** `worker-core/src/ai/vision.ts` gọi provider vision; chỉ khi `hasImage && needVisionCheck`.
  `Done khi:` 1 tin ảnh mơ hồ → vision trả price/voucher/productName (Zod validate).
- [ ] **B2** Merge kết quả vision vào `DealAnalysis` + tính lại decision/confidence.
  `Done khi:` tin trước "review vì mơ hồ" sau vision đủ điều kiện hơn; log token vision riêng.

## Nhóm C — Thêm affiliate network
- [x] **C1** Tiki + Sendo: `detectNetwork` đã nhận tiki/sendo (detect.ts) + role `product_link`; AffiliateRouter route tiki/sendo qua fallback AccessTrade (chưa có provider riêng → đúng thiết kế).
  `Done khi:` link tiki/sendo convert được, route đúng. ✅ `tests/affiliate-router.test.ts` (3 test: detect + route fallback + provider/fallback-on-error). Convert thật cần AccessTrade key.
- [ ] **C2** Làm chắc web fallback Shopee/Lazada chống đổi UI/CAPTCHA (selector trong config + alert khi vỡ).
  `Done khi:` khi selector sai → báo lỗi rõ + alert, không treo.

## Nhóm D — Quản lý nội dung sâu
- [ ] **D1** UI quản lý SourceProfile (trust level, mainPlatforms, allowAutoPublish) + Glossary.
  `Done khi:` sửa profile/glossary từ UI, pipeline dùng giá trị mới.
- [ ] **D2** Split tin nhiều link thành nhiều Content (rule `require_review` "nhiều link" → tách).
  `Done khi:` 1 tin 3 link sản phẩm → 3 Content xử lý độc lập.
- [ ] **D3** Tinh chỉnh dedup ở quy mô lớn (linkHash ưu tiên, seenFromSources cho trust scoring).
  `Done khi:` deal nhiều nguồn gộp đúng, đánh dấu "hot".

## Nhóm E — Throttling thông minh
- [ ] **E1** Random delay + khung giờ đăng + rate-limit theo target (tránh khóa acc).
  `Done khi:` publish rải theo delay/khung giờ cấu hình được, không bùng 1 lúc.

---
**Thứ tự:** A (mở rộng đích — giá trị thấy ngay) → E (throttle khi nhiều đích) → B (vision) → C/D (chiều sâu).
