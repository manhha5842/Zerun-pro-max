# Automation Change Log

> Trước khi merge thay đổi automation/publish flow, kiểm tra nhanh `IMPLEMENTATION_CHECKLIST.md`.

Ghi lại từng thay đổi liên quan tới platform automation, kèm nguồn tham chiếu cụ thể.

---

## 2026-06-11

### Facebook - khảo sát runtime Page post/photo/reel/comment qua Edge debug port
- **Files:**
  - `docs/automation-change-log.md`
  - `packages/adapters/src/platforms/facebook-selectors.ts`
- **Summary:**
  - Khảo sát thủ công bằng Edge mở với `--remote-debugging-port=9222`, điều khiển qua CDP/Playwright để mô phỏng cách runtime Selenium/Tauri sau này sẽ bám browser thật.
  - Account đã đăng nhập Facebook và đã chuyển identity sang Page `Ngọc Trai` qua modal `Chuyển trang cá nhân` / nút `Chuyển`.
  - Xác nhận Page profile URL sau switch: `https://www.facebook.com/nhaccuamongmer#`.
  - Xác nhận danh sách Page quản lý quan sát được:
    - `Ngọc Trai`, URL Page `https://www.facebook.com/nhaccuamongmer`, asset id quan sát từ Business Inbox: `111084616949772`.
    - `Câu cá King Vip`, asset id quan sát từ URL: `1104531792739008`, profile id trong link: `61570663287491`.
  - Khảo sát composer Page, đăng ảnh, đăng Reel, option mở rộng, lịch đăng, quyền riêng tư và comment box. Không bấm `Đăng`; draft ảnh/Reel đã đóng sau khảo sát.
  - Có upload file test do user chỉ định để mở màn sau upload:
    - `C:\Users\manhh\Downloads\2tnJ.jpeg`
    - `C:\Users\manhh\Downloads\Nấu Ăn Cuối Tuần\#trendingreels #anngon (7).mp4`
- **Observed selectors and flow notes:**
  - Page composer entry:
    - Button text: `Bạn đang nghĩ gì?`
    - Page-level media button: `div[role="button"][aria-label="Ảnh/video"]`
    - Page-level Reel button: `div[role="button"][aria-label="Thước phim"]`
    - Page-level live video button: `div[role="button"][aria-label="Video trực tiếp"]`
  - Create post modal:
    - Dialog: `[role="dialog"][aria-label="Tạo bài viết"]`
    - Identity text observed: `Ngọc Trai`
    - Privacy button aria: `Chỉnh sửa quyền riêng tư. Đang chia sẻ với Công khai.`
    - Textbox: `[role="dialog"] [role="textbox"][contenteditable="true"]`
    - Media input: `input[type="file"]`, accept contains `image/*` and `video/*`, `multiple=true`.
  - Add-to-post options observed:
    - `Ảnh/video`
    - `Gắn thẻ người khác`
    - `Video trực tiếp`
    - `Check in`
    - `Mời cộng tác viên`
    - `Cảm xúc/hoạt động`
    - `Ảnh GIF`
    - `Nhận tin nhắn`
    - `Nhận tin nhắn WhatsApp`
    - `Nhận cuộc gọi`
  - Photo post after upload:
    - Attachment edit button aria: `Chỉnh sửa file phương tiện`
    - Remove attachment aria: `Gỡ file đính kèm trong bài viết`
    - Photo edit panel options: `Cắt`, `Xoay`, `Gắn thẻ ảnh`, `Công cụ chèn văn bản`, `Văn bản thay thế`, `Lưu`, `Hủy`
    - `Video trực tiếp` becomes disabled after image is attached.
  - Post settings:
    - Dialog/header: `Cài đặt bài viết`
    - Options: `Đối tượng của bài viết`, `Lựa chọn lịch đăng`, `Chia sẻ lên nhóm`, `Chia sẻ lên tin`, `Quảng bá bài viết`
    - Schedule panel: date combobox example `11 Tháng 6, 2026`, time combobox example `18:54`, submit button `Lên lịch đăng sau`
    - Audience panel: `Công khai`, radio checked, `Đặt làm đối tượng mặc định`, button `Xong`
    - Final buttons: `Lưu` / aria `Lưu bài viết làm bản nháp`, and `Đăng` / aria `Đăng`
  - Reel flow:
    - Entry: `div[role="button"][aria-label="Thước phim"]`
    - First modal text: `Tạo thước phim`
    - Upload button aria: `Tải video lên cho Thước phim`
    - Reel video input: `input[type="file"]`, accept starts with `video/*`, `multiple=false`
    - After upload: preview video controls, `Tiếp`, pause button `Tạm dừng video`, slider `Change Position`, slider `Thay đổi âm lượng`, mute/unmute `Bật tiếng`
    - Edit step: `Chỉnh sửa thước phim`, caption placeholder text `Mô tả thước phim của bạn...`, `Thu ngắn video`, `Phụ đề`, copyright status `Đang kiểm tra nội dung có bản quyền`, then `Tiếp`
    - Final step: `Cài đặt thước phim`, `Công khai`, `Gắn thẻ và cộng tác`, `Remix và sử dụng âm thanh gốc`, `Chia sẻ lên nhóm`, `Chia sẻ lên tin`, `Quảng bá thước phim`, `Lựa chọn lịch đăng`, copyright ok message, `Lưu`, `Đăng`
  - Comment on Page post:
    - Voice switch aria: `Giọng nói hiện có, chuyển trang cá nhân`
    - Comment textbox aria: `Bình luận dưới tên Ngọc Trai`
    - Attach media aria: `Đính kèm một ảnh hoặc video`
    - Comment media input accepts image/video and is single-file in the observed DOM.
- **Implementation guidance:**
  - Không hardcode một selector đơn lẻ; luôn dùng fallback theo thứ tự: role/aria tiếng Việt runtime-verified, text tiếng Việt, CSS input/accept, English fallback nếu account đổi ngôn ngữ.
  - Selector config lưu thêm `selectorPolicy` và `domFingerprints`: HTML rút gọn, tín hiệu ổn định, tín hiệu phụ thuộc ngôn ngữ, và fallback plan để port sang Selenium/Tauri.
  - Với Selenium, ưu tiên `By.cssSelector`/`By.xpath` dựa trên role/dialog/input attributes; label text chỉ là fallback hoặc bước verify sau khi tìm thấy element.
  - Với Page, cần đảm bảo identity đang là Page trước khi publish/comment; nếu gặp modal `Chuyển trang cá nhân`, phải bấm `Chuyển` hoặc mở danh sách Page và chọn đúng Page theo tên/URL/id.
  - Với Reel và ảnh, sau upload phải chờ preview/`Tiếp` bật trước khi sang bước kế tiếp; không dựa vào timeout cố định nếu có thể quan sát trạng thái DOM.
  - Với `Đăng`, chỉ click ở bước cuối khi job thực sự được phép publish; trong khảo sát chỉ ghi nhận selector.
- **Sources:**
  - Runtime observation trên Edge debug port `9222`, Facebook tiếng Việt, Page `Ngọc Trai`, ngày 2026-06-11.
  - DOM snapshot, role/aria/text selector logs và screenshot quan sát trong phiên Codex hiện tại.
- **Confidence:** `runtime-verified` cho Page `Ngọc Trai` trong Facebook tiếng Việt; fallback tiếng Anh là `hypothesis` cho tương thích đa ngôn ngữ.

---

## 2026-04-21 (session 2)

### API - Instagram/Threads session health-check endpoints
- **Files:**
  - `apps/api/src/app.ts`
- **Summary:**
  - Generalized `inspectPersistedFacebookAccountHealth` → `inspectPersistedBrowserAccountHealth(app, account, platform)`.
  - Added `GET /accounts/:id/instagram-session`, `POST /accounts/:id/instagram-session/check`.
  - Added `GET /accounts/:id/threads-session`, `POST /accounts/:id/threads-session/check`.
  - `GET /accounts` now includes `sessionState` for Instagram and Threads accounts (not just Facebook).
  - Uses `testConnection()` from Instagram/Threads adapters (Playwright-based, confidence: `github-reference`).
- **Sources:**
  - Internal refactor; uses existing `InstagramAdapter.testConnection` and `ThreadsAdapter.testConnection` (already present).
- **Confidence:** `github-reference` (same Playwright session-check pattern as Facebook)

### Web Admin - AccountsPage session check for Instagram/Threads
- **Files:**
  - `apps/web-admin/src/pages/AccountsPage.tsx`
- **Summary:**
  - Merged `checkFacebookSession` + `checkInstagramSession` + `checkThreadsSession` into one generic `checkBrowserSession` mutation.
  - IG/Threads accounts now show "Kiểm tra session" button instead of italic hint text.
- **Sources:**
  - Internal; no new selectors or automation logic.
- **Confidence:** `n/a` (UI only)

### Web Admin - PostComposerPage IG story validation fix
- **Files:**
  - `apps/web-admin/src/pages/PostComposerPage.tsx`
- **Summary:**
  - Instagram Story now requires exactly 1 image (was: 1 media of any type).
  - Media hint text corrected per-platform.
- **Sources:**
  - Internal; matches platform constraint documented earlier.
- **Confidence:** `n/a` (validation rule, not selector)

### API - Upload validation
- **Files:**
  - `apps/api/src/app.ts`
- **Summary:**
  - `POST /uploads/manual` now validates MIME type and file size after save.
  - Rejects non-image/video files; image max 10MB; video max 500MB.
  - Invalid files deleted immediately after rejection.
- **Sources:**
  - Internal constraint logic; no platform selectors involved.
- **Confidence:** `n/a`

---

## 2026-04-21

### Adapters - shared Playwright helpers extracted
- **Files:**
  - `packages/adapters/src/utils/playwright-helpers.ts` (new)
  - `packages/adapters/src/platforms/instagram.ts` (imports refactored)
  - `packages/adapters/src/platforms/x.ts` (TODO comment)
- **Summary:**
  - Extracted `hasVisible`, `clickFirst`, `clickFirstVisible` from `instagram.ts` into shared `packages/adapters/src/utils/playwright-helpers.ts`.
  - Existing local definitions in `facebook.ts` remain (no selector changes; no source required).
  - Added `// TODO: not yet implemented` to the X publish method body to make scaffold status explicit.
  - No new automation selectors introduced; no UI flow changes.
- **Sources:**
  - Internal refactor only; no automation selectors changed.
- **Confidence:** `n/a` (refactor; no new automation logic)

### Facebook - feed/story/reel publish hardening
- **Files:**
  - `packages/adapters/src/platforms/facebook.ts`
- **Summary:**
  - Mở rộng flow publish cho feed/story/reel.
  - Thêm fallback cho composer, upload media, bước `Next/Tiếp`, và nút `Share/Post`.
  - Luôn publish từ `https://www.facebook.com/` theo session/profile đã lưu.
- **Sources:**
  - GitHub reference:
    - `https://github.com/minmin2402/minmin-farmer-source/blob/main/electron/engine/TaskPostReelsRunner.ts`
    - `https://github.com/nmthangdn2000/n8n-nodes-web-automation-tools/blob/main/src/modules/post-reels-facebook/post-reels-facebook.command.ts`
    - `https://github.com/dinhhuynguyen1405/auto-videos-genixtool/blob/main/modules/facebook-uploader/post-reels-facebook.command.ts`
    - `https://github.com/nmthangdn2000/social-tool/blob/main/src/commands/post-reels-facebook/post-reels-facebook.command.ts`
    - `https://github.com/tohieu1603/appsskill/blob/main/social-manager/src/adapters/facebook/scripts/fb-story.ts`
  - Runtime evidence:
    - internal browser observation when Facebook showed intermediate `Tiếp/Next`
    - internal Playwright selector failure logs captured during publish debugging
- **Confidence:** `github-reference` + `runtime-verified`

### Instagram - feed publish hardening
- **Files:**
  - `packages/adapters/src/platforms/instagram.ts`
- **Summary:**
  - Mở rộng selector cho `Create/New post`, caption input và nút `Share`.
  - Tăng fallback cho upload file và submit.
  - Thêm loop `Next/Continue` tới share screen và retry `Share` nhiều lần trước khi fail.
- **Sources:**
  - GitHub reference:
    - `https://github.com/cagatayalptekin/video-poster/blob/e968419608aff9169231a22b1317e788ffd535fc/src/services/publishers/instagram-playwright.publisher.ts`
    - `https://github.com/billion-app/billion/blob/6845aa689d10d0630fd4bb73e3481f44bc80a665/social-media-agent/example-instagram-post.ts`
    - `https://github.com/eugineous/propost/blob/2ebf0b3d22c8a3578758e789f882f7be83518dfd/lib/fallback/playwright.ts`
    - `https://github.com/KhungLongAnCo/auto-upload-videos/blob/39ac54e2049c09f157d9ad9af51631e3d208e21b/lib/publishers/instagram.ts`
    - `https://github.com/johnumarattil/social-post-engine/blob/d1ba7e9b30f934d73fa9c5edd0bf52991c28b2bd/packages/agents/src/instagram-publisher.ts`
  - Status:
    - chưa runtime-verified end-to-end trên máy hiện tại
- **Confidence:** `github-reference`

### Instagram - story publish deepening
- **Files:**
  - `packages/adapters/src/platforms/instagram.ts`
- **Summary:**
  - Thêm auth check trước khi publish story.
  - Dùng fallback từ home vào `Your Story / Tin của bạn`.
  - Thêm upload fallback và bước `Next / Tiếp` trước khi `Add to story / Share to story`.
  - Đã bỏ direct route `https://www.instagram.com/stories/create/` theo yêu cầu vì không có bằng chứng đủ mạnh.
- **Sources:**
  - GitHub reference cho story/share patterns:
    - `https://github.com/Akbar120/Ai-Assistant-Project/blob/b9fd9ad29e3bff977c0bd1e3c2e97cbbab7f8ad5/src/lib/automation.ts`
    - `https://github.com/RhythrosaLabs/otto-mate-2/blob/458bc1d8a6ac02a00eb317a8a9b57a0b4d972ea4/src/lib/social-media-browser.ts`
  - Note:
    - flow story hiện chỉ bám các pattern từ home/story entry có tham chiếu GitHub; không dùng direct route `/stories/create/` nữa.
- **Confidence:** `github-reference`

### Instagram - reel publish hardening
- **Files:**
  - `packages/adapters/src/platforms/instagram.ts`
- **Summary:**
  - Harden flow reel theo hướng upload video -> Next/Continue loop -> caption -> Share.
  - Mở rộng create menu, reel entry, video input, caption input, và share submit fallback.
- **Sources:**
  - GitHub reference:
    - `https://github.com/cagatayalptekin/video-poster/blob/e968419608aff9169231a22b1317e788ffd535fc/src/services/publishers/instagram-playwright.publisher.ts`
    - `https://github.com/nmthangdn2000/social-tool/blob/5079d9b7c33b2d0014dacfe8d86ad3eacaee9507/src/commands/post-reels-instagram/post-reels-instagram.command.ts`
    - `https://github.com/angelcgar/social-bot/blob/076e8af879ba3595ffbe50604b6dc9e8c41b8b92/src/networks/instagram.ts`
    - `https://github.com/shariqsk/allinonesocials/blob/102f9a29c5fe3b8777752c71a98b72edc8169a49/electron/services/platforms/instagram-adapter.ts`
    - `https://github.com/sojeong94/hol-si-wep/blob/dbaf501119e42ca6a3fc0809d8cd672a26cafed2/server/automation/publishers/instagram.ts`
  - Status:
    - chưa runtime-verified end-to-end trên máy hiện tại
- **Confidence:** `github-reference`

### Threads - post publish hardening
- **Files:**
  - `packages/adapters/src/platforms/threads.ts`
- **Summary:**
  - Mở rộng selector cho `New thread/Create/Compose/Viết`.
  - Mở rộng textbox fallback, media attach fallback, và `Post` submit fallback.
  - Thêm retry `Post`, mở rộng media input (`image/video/file`) và attach flow để xử lý post media ổn định hơn.
- **Sources:**
  - GitHub reference:
    - `https://github.com/NomaDamas/auto-hongmyungbo/blob/270a4520d2e7f5e22f9b89c159e548d34e2704af/frontend/src/server/browser-automation.ts`
    - `https://github.com/AlanAndreUP/scrapper_theards/blob/8782d0536f081b1aa50b1ec341e3990f2196a570/src/scraper/threadsScraper.ts`
  - Status:
    - chưa runtime-verified end-to-end trên máy hiện tại
- **Confidence:** `github-reference`

### Instagram / Facebook / Threads - comment queue execution
- **Files:**
  - `packages/worker-core/src/processors/comment.ts`
  - `packages/worker-core/src/processors/publish.ts`
  - `packages/worker-core/src/runtime.ts`
  - `packages/adapters/src/contracts.ts`
  - `packages/adapters/src/platforms/facebook.ts`
  - `packages/adapters/src/platforms/threads.ts`
  - `packages/adapters/src/platforms/instagram.ts`
- **Summary:**
  - Added real `CommentQueue` execution flow: after publish success, if `content.metadata.comment` exists, system creates `CommentQueue` record and schedules `comment.execute` worker job.
  - Retry/reschedule from pending-comments page now re-enqueue real worker jobs.
  - Added adapter-level `comment()` support.
  - Implemented actual comment automation for Facebook, Threads, and Instagram.
- **Sources:**
  - Facebook comment selectors derived from code already present in `facebook.ts` and existing runtime-tested Facebook session/publish work in this repo.
  - Threads reply selectors derived from code already present in `threads.ts` (`Reply`, reply textbox, `Post`).
  - Instagram comment selectors based on existing Instagram Playwright publish patterns and generic comment entry patterns observed in Playwright references:
    - `textarea[aria-label*="comment" i]`
    - `textarea[placeholder*="comment" i]`
    - comment trigger by `aria-label*="Comment"`
    - submit by `Post`
  - External GitHub reference used as supporting Playwright pattern source for Instagram web interaction style:
    - `https://raw.githubusercontent.com/cagatayalptekin/video-poster/e968419608aff9169231a22b1317e788ffd535fc/src/services/publishers/instagram-playwright.publisher.ts`
- **Status:**
  - Facebook/Threads comment execution wired in worker and structurally ready.
  - Instagram comment execution implemented but not runtime-verified end-to-end on this machine yet.
- **Confidence:**
  - Facebook: `runtime-verified` / existing internal implementation lineage
  - Threads: `github-reference`
  - Instagram: `hypothesis` (selectors based on reference patterns, not yet verified)

---

## 2026-06-14

### M1 — content-process.ts: routing.useAI gate + auto-publish fix
- **Files:**
  - `packages/worker-core/src/processors/content-process.ts`
- **Summary:**
  - Di chuyển `resolveRouting()` lên trước block AI để có `routing.useAI` trước khi gọi AI.
  - Thêm điều kiện `routing.useAI` vào guard `if (ruleResult.needAi && routing.useAI)` — khi user tắt AI ở routing rule thì không gọi AI dù rule engine nói needAi=true.
  - Sửa auto-publish khi không có AI: `autoTargets = aiDecision ? (aiDecision.autoPublish ? ... : []) : routing.autoPublishTargetIds` — trước đây nếu không có AI thì autoTargets luôn rỗng, content ngồi ở `ready_to_publish` không ai publish.

### M1 — RoutingPage.tsx: thêm cột useAI/requireReview và nút Xóa/Bật-Tắt
- **Files:**
  - `apps/web-admin/src/pages/RoutingPage.tsx`
- **Summary:**
  - Thêm cột Tự đăng / Dùng AI / Cần duyệt / Trạng thái vào bảng routing rules.
  - Thêm nút Bật/Tắt (PUT /routing-rules/:id) và Xóa (DELETE) mỗi rule.
  - Dùng Badge tone để phân biệt trạng thái trực quan.
