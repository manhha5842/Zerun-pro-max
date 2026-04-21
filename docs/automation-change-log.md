# Automation Change Log

Ghi lại từng thay đổi liên quan tới platform automation, kèm nguồn tham chiếu cụ thể.

---

## 2026-04-21

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
