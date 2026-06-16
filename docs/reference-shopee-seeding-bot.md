# Tham khảo: logic từ `shopee-seeding-bot-develop` (Python)

> Trích logic cần thiết để port sang Zerun (TS). Nguồn: `C:\Users\manhh\Projects\shopee-seeding-bot-develop`.
> Các file gốc: `shopee_aff_api.py`, `shopee_aff.py`, `ninerouter.py`, `link_converter.py`, `playwright_browser.py`.

## 1. Shopee Affiliate — convert link (QUAN TRỌNG NHẤT)

**Ý tưởng:** không cần Shopee Open API. Mở tab `shopee.vn`/`affiliate.shopee.vn` đã đăng nhập,
rồi **chạy `fetch` ngay trong trang** (browser context) tới GraphQL — request mang theo cookie
đăng nhập (`credentials: 'include'`). Cookie `.shopee.vn` cover luôn `affiliate.shopee.vn`.

### 1a. API-first (ưu tiên)

- **Endpoint:** `POST https://affiliate.shopee.vn/api/v3/gql?q=batchCustomLink`
- **GraphQL query:**
  ```graphql
  query batchGetCustomLink($linkParams:[CustomLinkParam!],$sourceCaller:SourceCaller){
    batchCustomLink(linkParams:$linkParams,sourceCaller:$sourceCaller){ shortLink longLink failCode }
  }
  ```
- **Body:**
  ```json
  {
    "query": "<query trên>",
    "variables": {
      "linkParams": [{ "originalLink": "<clean_url>", "advancedLinkParams": { "subId1": "...", "subId2": "...", "subId3": "...", "subId4": "...", "subId5": "" } }],
      "sourceCaller": "CUSTOM_LINK_CALLER"
    }
  }
  ```
- **Cách gọi trong browser** (Selenium dùng `execute_async_script`; Playwright dùng `page.evaluate`):
  ```js
  // chạy trong context trang đã login
  const r = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json; charset=UTF-8', 'accept': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: r.status, text: await r.text() };
  ```
- **Strip tracking params khỏi URL gốc trước khi gọi** (Shopee thêm vào, làm hỏng API):
  `sp_atk, xptdk, extraParams, uls_trackid, smtt, utm_source, utm_medium, utm_campaign`.
- **SubID** (tracking): vd `subId1=seeding`, `subId2=comment`, `subId3=group{N}`,
  `subId4=slug(productName)` (chỉ `[a-zA-Z0-9]`, web UI bắt buộc strip ký tự khác).
- **Phân loại lỗi (error_code):**
  - `LOGIN_REQUIRED` — status 401 hoặc "unauthorized" → cần login lại, **dừng, không retry**.
  - `FAIL_CODE` — `item.failCode` có giá trị → Shopee từ chối link đó → **thử web UI fallback**.
  - `NO_DATA` — `batchCustomLink` rỗng / `shortLink` rỗng → có thể dính CAPTCHA → cần người vào giải.
  - `TIMEOUT` / `HTTP` — lỗi mạng/script timeout.
- Kết quả OK: `data.data.batchCustomLink[0].shortLink` (và `longLink`).

### 1b. Web UI fallback (khi API trả `FAIL_CODE`)

Mở trang `https://affiliate.shopee.vn/offer/custom_link`:
1. Nhập link gốc vào textarea.
2. Điền các ô `#customLink_sub_id1..4` (strip về `[a-zA-Z0-9]`).
3. Bấm nút "Lấy link" / "Get Link".
4. Đọc kết quả từ popup `div.ant-modal textarea, div.ant-modal input[type=text]` — lọc giá trị
   chứa `s.shopee.vn` / `shope.ee` / `shopee.vn`.
5. Đóng popup.

### 1c. Cảnh báo lỗi

Khi cả API lẫn web UI fail → gửi Telegram alert (kèm hướng dẫn: login lại / giải CAPTCHA).
Lưu `_last_api_error` để alert sau khi web UI cũng fail.

## 2. 9Router — AI client OpenAI-compatible

- **Base URL normalize:** strip `/` cuối và bỏ hậu tố `/v1` nếu có (rồi tự nối `/v1/...`).
- **Health check (tùy chọn):** `GET {base}/api/health` → `{ ok: true }`. Cache 5' nếu OK, 30s nếu fail.
- **Auto model:** nếu chưa cấu hình combo/model → `GET {base}/v1/models` lấy `data[0].id`.
- **Chat:** `POST {base}/v1/chat/completions` body `{ model, messages:[{role:'system'},{role:'user'}], stream:false, temperature, max_tokens }`.
- **Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`, **kèm `User-Agent`**
  (Cloudflare chặn request thiếu UA).
- **Đọc kết quả:** `data.choices[0].message.content` (content có thể là string hoặc array `[{text}]`).
- **Retry:** retry khi HTTP 408/409/425/429/5xx hoặc response rỗng; backoff `delay * attempt`.
- **Config keys:** `url`, `token`, `combo`(model), `timeout`, `retry_count`, `retry_delay_seconds`,
  `health_check`, `temperature`, `max_tokens`. Token bị che (`•`, `***`, `a...b`) thì bỏ qua.

→ Trong Zerun: implement `OpenAiCompatibleProvider(baseUrl, apiKey, model)` cho `AiProvider` interface
(đã scaffold ở `packages/core/src/ai/provider.ts`). Cùng provider này chạy được DeepSeek/MiniMax/OpenAI.

## 3. Playwright profile lifecycle (port pattern)

Dùng `chromium.launch_persistent_context(userDataDir, { channel, headless, args })`:
- **channel:** `msedge` (edge) / `chrome`; hoặc `executable_path` cho browser khác.
- **args quan trọng:** `--disable-background-timer-throttling`,
  `--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`,
  `--autoplay-policy=user-gesture-required`, và `--profile-directory=<dir>` nếu chọn profile con.
- **Profile riêng cho bot** (khuyến nghị): thư mục `userDataDir` riêng thay vì profile gốc
  (profile gốc bị khóa khi browser đang mở). Có hàm scan profile sẵn có của Edge/Chrome qua
  `Local State > profile.info_cache`.
- **Test capability:** mở persistent context với thư mục tạm, `goto('about:blank')`, đọc
  `navigator.userAgent`, rồi cleanup — xác nhận Playwright chạy headless không cần debug port.

Map sang yêu cầu profile cho Zerun (mọi adapter Playwright + zca-js đều cần):
`Tạo profile → Mở để login thủ công (headful) → Test login → Chạy headless → Dừng → Xóa profile`.

## 4. Link shortening (post-step, tách khỏi affiliate)

`link_converter.py` rút gọn link SAU khi đã có aff link (khác với "convert affiliate"):
- Không cần key: `shope.ee` (đổi domain `s.shopee.vn`→`shope.ee`), `is.gd`, `v.gd`,
  `tinyurl (free)`, `shrtco.de`, `lnk.ink`.
- Cần key: `Short.io` (`api_key`+`domain`, auto lấy domain qua `GET api.short.io/api/domains`).
- Mode: `off` | một provider | `rotate` (shuffle pool, lấy cái đầu thành công).

→ Zerun có thể thêm bước rút gọn tùy chọn sau affiliate convert (không bắt buộc cho M1).

## 5. Ghi chú port sang TS

- Shopee converter: dùng Playwright `page.evaluate(async () => { ... fetch ... })` thay cho
  Selenium `execute_async_script`. Logic/endpoint/error-code giữ nguyên.
- Cần một **browser/profile manager** chung (Playwright persistent context) để Shopee converter,
  zca-js login, và các publish adapter web dùng lại — đúng yêu cầu profile lifecycle ở trên.
- 9router → 1 provider class duy nhất, cấu hình qua bảng `AiConfig`.
