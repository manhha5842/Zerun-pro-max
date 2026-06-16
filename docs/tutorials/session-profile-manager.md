# Tutorial — Session / Profile Manager

> Quản lý vòng đời profile (Playwright) và session (zca-js / GramJS) dùng chung cho mọi adapter.
> 6 thao tác: **Tạo → Mở login thủ công → Test login → Chạy headless → Dừng → Xóa**.
> Pattern Playwright port từ `playwright_browser.py`
> ([reference](../reference-shopee-seeding-bot.md#3-playwright-profile-lifecycle-port-pattern)).

## 1. Vì sao cần module chung

Shopee converter (Playwright), zca-js (Zalo), GramJS (Telegram), và adapter web (FB/Threads/X)
đều cần một "phiên đăng nhập" tồn tại lâu dài. Repo đã có:
- Model `PlatformSession { platform, accountKind, accountId, status, cookiePath, data Json, expiresAt }`.
- Trang `apps/web-admin/src/pages/AccountSessionsPage.tsx`.

→ Mở rộng cái này thành **manager thống nhất** thay vì mỗi adapter tự xử lý.

## 2. Hai loại "phiên"

| Loại | Dùng cho | Lưu gì |
|---|---|---|
| **Playwright persistent profile** | Shopee converter, FB/Threads/X web | thư mục `userDataDir` (cookies trên đĩa) → `cookiePath` |
| **Client session** | zca-js (Zalo), GramJS (Telegram) | string/JSON session → `PlatformSession.data` (M2 sẽ mã hoá) |

## 3. Cấu trúc đề xuất

```
packages/adapters/src/session/
  profile-store.ts      # quản lý thư mục userDataDir cho từng account
  playwright-profile.ts # launch persistent context (headful/headless), test, stop
  session-manager.ts    # facade 6 thao tác, ghi/đọc PlatformSession
```

## 4. Playwright persistent context (điểm mấu chốt)

```ts
import { chromium, type BrowserContext } from "playwright";

export async function launchProfile(opts: {
  userDataDir: string; headless: boolean; channel?: "msedge" | "chrome";
  executablePath?: string;
}): Promise<BrowserContext> {
  return chromium.launchPersistentContext(opts.userDataDir, {
    headless: opts.headless,
    channel: opts.channel,                 // dùng Edge/Chrome thật nếu có
    executablePath: opts.executablePath,   // hoặc trỏ binary khác
    args: [
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--autoplay-policy=user-gesture-required"
    ]
  });
}
```

- **Mỗi account = 1 `userDataDir` riêng** dưới `storage/sessions/<platform>/<accountId>/`.
  Đừng dùng profile gốc của browser (bị khóa khi browser đang mở).
- **Headful** khi login thủ công; **headless** khi chạy nền.

## 5. 6 thao tác (API của session-manager)

```ts
createProfile(platform, accountId)        // tạo userDataDir rỗng, ghi PlatformSession status="new"
openForLogin(platform, accountId)         // launch headful, người dùng login tay, giữ context mở
testLogin(platform, accountId): Promise<{ok, status}>  // xem mục 6
runHeadless(platform, accountId)          // launch headless để adapter dùng
stopProfile(platform, accountId)          // context.close(), status="stopped"
deleteProfile(platform, accountId)        // rmrf userDataDir, xóa PlatformSession
```

Cập nhật `PlatformSession.status`: `new | login_required | authenticated | running | stopped | failed`.

## 6. Test login theo từng platform

| Platform | Cách test |
|---|---|
| Shopee | mở `affiliate.shopee.vn`, gọi thử `batchCustomLink` 1 link mẫu → không `LOGIN_REQUIRED` (xem [shopee tutorial](shopee-affiliate-converter.md)) |
| Zalo (zca-js) | gọi API `fetchAccountInfo`/ping → ok |
| Telegram (GramJS) | `client.isUserAuthorized()` (đã có ở `telegram.ts`) |
| FB/Threads/X web | mở trang home, kiểm tra có avatar/nút đăng (selector) |

## 7. UI

Mở rộng `AccountSessionsPage.tsx`: mỗi account 1 hàng + 6 nút. Nút "Mở login" chạy headful;
khi đóng cửa sổ → auto `testLogin` để cập nhật trạng thái.

## 8. Gotchas

- Windows: dùng `channel: "msedge"` đỡ phải tải Chromium riêng.
- Không mở 2 context cùng `userDataDir` đồng thời → lock error.
- zca-js: **không** chạy đồng thời nhiều listener bằng cùng một tài khoản (rủi ro khóa).
- Headless đôi khi bị Shopee/FB nghi ngờ hơn headful — cân nhắc headless=false cho bước nhạy cảm.

## Done checklist
- [ ] `launchProfile` persistent context chạy được headful + headless
- [ ] 6 thao tác hoạt động, cập nhật `PlatformSession.status`
- [ ] `testLogin` cho Shopee + Zalo + Telegram
- [ ] UI 6 nút ở AccountSessionsPage
- [ ] mỗi account dùng userDataDir riêng dưới storage/sessions
