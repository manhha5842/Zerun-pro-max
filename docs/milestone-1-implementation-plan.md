# Milestone 1 — Flow dọc đầy đủ (collect → process → convert → repost)

**Mục tiêu:** một tin từ Telegram/Zalo group → xử lý rule+AI → convert affiliate
(Shopee web / Lazada API / AccessTrade) → review → đăng lại lên Telegram/Zalo group.
**Exit:** chạy thử 1 tin thật đi hết flow, đăng lại thành công, có review queue.

## Quy tắc thực thi (đọc [roadmap.md](roadmap.md#quy-tắc-thực-thi-áp-dụng-cho-mọi-plan))
- Tick `[x]` **ngay khi xong từng task**, không gom cuối.
- Chỉ tick khi thỏa **`Done khi:`**.
- 📘 = đọc tutorial trước khi làm.
- `npm run typecheck` xanh trước khi tick task có code.

## Trạng thái nền (đã có sẵn)
- ✅ Scaffold rule+AI: `packages/core/src/{rules,ai}` (glossary, source-profile, rule-engine, schemas, provider, context-builder, decision).
- ✅ Adapters: telegram (GramJS), accesstrade. Worker: `content-process`, `publish`, routing.
- ✅ Models: CrawlResult, Content, ContentLink, RoutingRule, PlatformSession, AiConfig.

---

## Nhóm 0 — Session/Profile Manager  📘 [session-profile-manager.md](tutorials/session-profile-manager.md)
Nền cho Shopee converter + zca-js. Làm trước.

- [x] **0.1** `session/profile-store.ts` (userDataDir `storage/sessions/<platform>/<kind>/<accountId>/`; ensureProfileDir, removeProfileDir, upsertSession, getSession).
  `Done khi:` tạo/xóa được thư mục profile cho 1 account, ghi `PlatformSession`.
- [x] **0.2** `session/playwright-profile.ts`: `launchProfile()` persistent context (headful + headless, channel chrome/msedge); `testLoginPage()` helper.
  `Done khi:` mở được cửa sổ headful và 1 lần headless với cùng profile (không cùng lúc).
- [x] **0.3** `session/session-manager.ts` facade 6 thao tác (create/openForLogin/testLogin/runHeadless/stop/delete) cập nhật `PlatformSession.status`; `session/zalo-qr-login.ts` QR flow riêng cho zca-js.
  `Done khi:` gọi tuần tự 6 hàm cho 1 account không lỗi, status đổi đúng.
- [x] **0.4** UI: thêm API endpoint QR login cho Zalo; `AccountSessionsPage.tsx` 6 nút/account + QR display.
  `Done khi:` thao tác đủ 6 nút từ UI cho 1 account; Zalo có thể scan QR để login.

## Nhóm A — AI provider (9router)  📘 [ai-provider-9router.md](tutorials/ai-provider-9router.md)

- [x] **A1** `packages/worker-core/src/ai/openai-compatible-provider.ts` (normalizeBase, UA header, health, auto-model, retry, đọc content string|array).
  `Done khi:` gọi 9router thật trả về text.
- [x] **A2** `system-prompt.ts`: static prompt (rules + DealAnalysis schema + 2–3 few-shot).
  `Done khi:` 1 tin mẫu → `parseDealAnalysis` ra `DealAnalysis` hợp lệ (Zod pass).
- [x] **A3** Dựng provider từ `AiConfig`/`.env`, mask token, `apiKey: "env:..."`.
  `Done khi:` đổi model/provider chỉ bằng sửa config, không sửa code.
- [x] **A4** `/settings/ai/test-connection` endpoint + button "Test kết nối" ở SettingsPage.tsx (hiển thị OK + model + latency).
  `Done khi:` bấm Test ở Settings báo OK + model đang dùng.

## Nhóm B — Collect + Dedup
📘 [zalo-zca-js.md](tutorials/zalo-zca-js.md) · [dedup-multi-source.md](tutorials/dedup-multi-source.md)

- [~] **B1** Telegram: xác nhận source account + crawl cursor → `CrawlResult` (đã có, kiểm/hoàn thiện).
  Code hoàn chỉnh trong `source-crawl.ts` (dedup externalId + contentHash, enqueue content-process). Cập nhật 15/06: crawl ưu tiên các `PlatformChannel` đã chọn; mỗi kênh nguồn được gắn `sourceChannelId`.
  `Done khi:` crawl 1 group thật, CrawlResult xuất hiện, không trùng (unique chạy).
- [~] **B2** zca-js. Đã xong: adapter + `realtime-listener.ts` worker (boot gọi startListener → persist Content → enqueue content-process). **Còn lại:** QR login flow lưu credentials (qua Nhóm 0), test thật.
  Cập nhật 15/06: listener chỉ nhận các `threadId` đã thêm ở **Quản lý kênh nguồn** và lưu `sourceChannelId`.
  `Done khi:` quét QR login xong, tin mới trong group Zalo vào Content.
- [x] **B3** Bước `CrawlResult → Content` (tạo Content, gắn source, externalId).
  `Done khi:` 1 CrawlResult sinh 1 Content `status=discovered`.
- [x] **B4** Dedup chéo nguồn: cột `contentHash`(+index) + `Content.duplicateOfId`; `core/src/links/dedup.ts` (linkHash/textHash) + cửa sổ N giờ; tin trùng → `status="duplicate"`, không AI/convert/publish.
  `Done khi:` 2 tin cùng link từ 2 nguồn → chỉ 1 Content đi tiếp, cái kia "duplicate". Có unit test cho hàm hash.

## Nhóm C — Process (wire rule + AI)
- [x] **C1** Trong `content-process.ts`: rule `verdict="skip"` → skip sớm, không gọi AI; `needAi=true` → `evaluateRules → buildAiContext → classifyWithRetry → decideContent`.
  `Done khi:` tin "skip" không tốn call AI; tin hợp lệ có `DealAnalysis`.
- [x] **C2** Lưu kết quả: `Content.metadata.ai = analysis`, `draftText = rewrittenText`; status theo `decideContent` kết hợp routing.
  `Done khi:` Content có ai reason/confidence + draftText; status đúng theo ngưỡng.

## Nhóm D — Convert affiliate (router theo network)
📘 [shopee-affiliate-converter.md](tutorials/shopee-affiliate-converter.md) · [lazada-affiliate-api.md](tutorials/lazada-affiliate-api.md)

- [x] **D1** `AffiliateRouter` (`adapters/src/affiliate/router.ts`) route theo network; registry.ts dùng AffiliateRouter thay AccessTrade trực tiếp.
  `Done khi:` link shopee/lazada/tiktok route đúng provider.
- [x] **D2** `shopee-affiliate.ts` (3 mode: accesstrade/web/auto; batchCustomLink qua page.evaluate khi mode=web; fallback AccessTrade).
  `Done khi:` module + mode config xong; test thật qua AccessTrade ok khi có key.
- [x] **D3** `lazada-api.ts` (`/marketing/getlink`, batch ≤100, dm>mm>regular, sign HMAC-SHA256, status enums); route lazada tạm qua AccessTrade fallback.
  `Done khi:` module xong. ⛔ **Test convert thật blocked** tới khi User Token hết Pending.
- [x] **D4** Route `tiktok_shop` + default → AccessTrade fallback trong AffiliateRouter.
  `Done khi:` default route qua AccessTrade (đã có).
- [x] **D5** Thay link trong caption (`applyConvertedLinks` đã có) + gỡ link rác (role drop từ rule).
  `Done khi:` `finalText` chứa aff link, không còn link group/tutorial.
- [x] **D6** `manual.ts` + manual convert queue khi provider fail.
  `Done khi:` convert fail → ContentLink `status=failed` + hiện ở manual queue UI.

## Nhóm E — Repost (Telegram + Zalo)
- [~] **E1** Telegram target publish (đã có) — kiểm group/channel.
  Code hoàn chỉnh: `TelegramAdapter.publish()` + registered. `processPublish()` route qua registry. Cập nhật 15/06: khi có `targetChannelId`, worker inject `PlatformChannel.externalId` vào `credentials.target`.
  `Done khi:` đăng 1 bài lên Telegram channel thật, có `PublishAttempt` success.
- [~] **E2** zca-js publish group (`sendMessage` + media) qua PublishAdapter.
  Code hoàn chỉnh: `ZaloPersonalAdapter.publish()` + registered. Cập nhật 15/06: khi có `targetChannelId`, worker inject `PlatformChannel.externalId` vào `config.threadId`.
  `Done khi:` đăng 1 bài lên Zalo group thật, có PublishAttempt.
- [~] **E3** RoutingRule cấu hình thật + cho AI/routing bắt tay: dùng `useAI`, kết hợp `requireReview` với `decideContent`; auto-publish chỉ khi rule cho phép + safe + confidence ≥0.85.
  Code hoàn chỉnh: `routing.useAI` gate AI call; auto-publish với/không AI đều đúng; RoutingPage có đủ cột + nút. Cập nhật 15/06: flow mới dùng `RepostFlow` theo `sourceChannelIds → targetChannelIds`, có lọc ngành ở từng kênh đích và hỗ trợ nội dung tổng quát.
  `Done khi:` 1 source cấu hình auto → tin đủ điều kiện tự vào publish; tin require-review thì dừng ở queue.

## Nhóm F — Glue & test E2E
- [x] **F1** `.env.example` cập nhật: NINEROUTER_URL/KEY, AI_MODEL, ACCESSTRADE_*, LAZADA_*, SESSION_STORAGE_DIR.
  `Done khi:` clone sạch + điền .env chạy được dev.
- [x] **F2** Review UI: hiện ai reason/confidence, link gốc↔aff, ảnh giữ/bỏ, approve/edit/reject (mở rộng `ContentDetailPage.tsx`).
  `Done khi:` duyệt 1 tin từ UI → chuyển sang publish.
- [ ] **F3** Test E2E: 1 tin thật Telegram + 1 tin thật Zalo đi hết flow đến khi đăng lại.
  `Done khi:` cả 2 nguồn ra bài đăng thật qua mô hình nhiều kênh nguồn → nhiều kênh đích, log đầy đủ. **← Exit M1.**

## Cập nhật 15/06/2026 — Kiến trúc kênh và flow N:N

- [x] Schema/API có `PlatformChannel`, `RepostFlow`, `RepostFlowSource`, `RepostFlowTarget`.
- [x] UI tài khoản bỏ chọn group/channel trong wizard; wizard chỉ dùng để kết nối phiên.
- [x] UI quản lý nhiều kênh nguồn/đích cho mỗi tài khoản.
- [x] UI kênh đích có bộ lọc `Nhận tất cả` hoặc `Theo ngành`, kèm tùy chọn nhận nội dung tổng quát.
- [x] UI Flow đăng lại dùng mô hình N:N theo kênh: nhiều kênh nguồn → bộ xử lý → nhiều kênh đích.
- [x] Worker crawl/listener gắn `sourceChannelId`.
- [x] Worker routing ưu tiên `RepostFlow + PlatformChannel` khi có `sourceChannelId`.
- [x] Worker publish nhận `targetChannelId` và đăng đúng group/channel.
- [ ] Test tài khoản thật Telegram/Zalo cho flow N:N.

---

## Thứ tự đề xuất
`0 → A → B1 → C → D → E1/E3 → F2` chạy được nhánh Telegram trước (không phụ thuộc zca-js).
Sau đó `B2 (Zalo) → E2` bổ sung Zalo. `B4 dedup` có thể chèn sau B3 bất cứ lúc nào.
