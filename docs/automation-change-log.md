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

### Instagram - feed publish fallback expansion
- **Files:**
  - `packages/adapters/src/platforms/instagram.ts`
- **Summary:**
  - Mở rộng selector cho `Create/New post`, caption input và nút `Share`.
  - Tăng fallback cho upload file và submit.
- **Sources:**
  - GitHub reference:
    - `https://github.com/cagatayalptekin/video-poster/blob/e968419608aff9169231a22b1317e788ffd535fc/src/services/publishers/instagram-playwright.publisher.ts`
    - `https://github.com/nmthangdn2000/social-tool/blob/5079d9b7c33b2d0014dacfe8d86ad3eacaee9507/src/commands/post-reels-instagram/post-reels-instagram.command.ts`
    - `https://github.com/angelcgar/social-bot/blob/076e8af879ba3595ffbe50604b6dc9e8c41b8b92/src/networks/instagram.ts`
  - Status:
    - chưa runtime-verified end-to-end trên máy hiện tại
- **Confidence:** `github-reference`

### Instagram - story publish deepening
- **Files:**
  - `packages/adapters/src/platforms/instagram.ts`
- **Summary:**
  - Thêm auth check trước khi publish story.
  - Thêm direct route `https://www.instagram.com/stories/create/`.
  - Thêm fallback từ home vào `Your Story / Tin của bạn`.
  - Thêm upload fallback và bước `Next / Tiếp` trước khi `Add to story / Share to story`.
- **Sources:**
  - GitHub reference:
    - `https://github.com/Akbar120/Ai-Assistant-Project/blob/b9fd9ad29e3bff977c0bd1e3c2e97cbbab7f8ad5/src/lib/automation.ts`
    - `https://github.com/RhythrosaLabs/otto-mate-2/blob/458bc1d8a6ac02a00eb317a8a9b57a0b4d972ea4/src/lib/social-media-browser.ts`
  - Note:
    - direct route `/stories/create/` hiện mới ở mức **GitHub/pattern-based reference**, chưa có official doc và chưa runtime-verified end-to-end tại thời điểm ghi log.
- **Confidence:** `github-reference`

### Threads - post publish fallback expansion
- **Files:**
  - `packages/adapters/src/platforms/threads.ts`
- **Summary:**
  - Mở rộng selector cho `New thread/Create/Compose/Viết`.
  - Mở rộng textbox fallback, media attach fallback, và `Post` submit fallback.
- **Sources:**
  - GitHub reference:
    - `https://github.com/AlanAndreUP/scrapper_theards/blob/8782d0536f081b1aa50b1ec341e3990f2196a570/src/scraper/threadsScraper.ts`
    - `https://github.com/NomaDamas/auto-hongmyungbo/blob/270a4520d2e7f5e22f9b89c159e548d34e2704af/frontend/src/server/browser-automation.ts`
  - Status:
    - chưa runtime-verified end-to-end trên máy hiện tại
- **Confidence:** `github-reference`
