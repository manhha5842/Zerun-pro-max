# Tutorial — Shopee affiliate converter (TS port)

> Tạo affiliate link Shopee. Port từ `shopee_aff_api.py` + `shopee_aff.py`.
> Logic gốc chi tiết: [reference](../reference-shopee-seeding-bot.md#1-shopee-affiliate--convert-link-quan-trọng-nhất).
> Web method cần [Session Manager](session-profile-manager.md) (profile Shopee đã login).

## 0. Chọn cách convert (LINH ĐỘNG — cấu hình được)

Shopee có **3 đường**, dùng cái nào tùy cấu hình từng source/account (set trong affiliate router, D1):

1. **Web API** (ưu tiên khi có session): cookie web + GraphQL `batchCustomLink` — §3.
2. **Web UI fallback**: thao tác trang custom_link khi API trả `FAIL_CODE` — §4.
3. **AccessTrade API**: provider đã có (`affiliate/accesstrade.ts`) — không cần session/browser,
   nhưng phụ thuộc campaign AccessTrade hỗ trợ Shopee.

**Chuỗi fallback gợi ý (cấu hình được, không cứng):**
```
mode = "web"        → Web API → Web UI → (tùy chọn) AccessTrade → manual queue
mode = "accesstrade"→ AccessTrade → (tùy chọn) Web API → manual queue
mode = "auto"       → thử theo thứ tự nào có sẵn session/credential trước
```
Lưu `mode` trong config của source/router. Mục tiêu: nếu chưa login web thì vẫn convert được qua
AccessTrade, và ngược lại nếu AccessTrade không có campaign thì rơi về web. Xem router ở
[lazada tutorial §A](lazada-affiliate-api.md#phần-a--affiliate-router-d1).

## 1. Vị trí file
```
packages/adapters/src/affiliate/shopee-web.ts   # ShopeeWebAffiliateProvider
```
Khớp interface `AffiliateAdapter` (xem `packages/adapters/src/contracts.ts`,
tham khảo `affiliate/accesstrade.ts`). Đăng ký vào affiliate router (xem
[lazada tutorial §router](lazada-affiliate-api.md) và plan M1·D1).

## 2. Bước 1 — clean URL
Strip tracking params trước khi gọi API (nếu không Shopee từ chối):
```
sp_atk, xptdk, extraParams, uls_trackid, smtt, utm_source, utm_medium, utm_campaign
```

## 3. Bước 2 — API qua cookie (ưu tiên)
Mở page Shopee đã login (từ Session Manager), chạy `fetch` **trong page** (Playwright `page.evaluate`):

```ts
const ENDPOINT = "https://affiliate.shopee.vn/api/v3/gql?q=batchCustomLink";
const QUERY =
  "query batchGetCustomLink($linkParams:[CustomLinkParam!],$sourceCaller:SourceCaller)" +
  "{batchCustomLink(linkParams:$linkParams,sourceCaller:$sourceCaller){shortLink longLink failCode}}";

async function convertViaApi(page, cleanUrl: string, subIds: Record<string,string>) {
  const body = {
    query: QUERY,
    variables: {
      linkParams: [{ originalLink: cleanUrl, advancedLinkParams: subIds }],
      sourceCaller: "CUSTOM_LINK_CALLER"
    }
  };
  const res = await page.evaluate(async ({ url, body }) => {
    try {
      const r = await fetch(url, {
        method: "POST",
        credentials: "include",                 // ← dùng cookie đã login
        headers: { "content-type": "application/json; charset=UTF-8", accept: "application/json" },
        body: JSON.stringify(body)
      });
      return { status: r.status, text: await r.text() };
    } catch (e) { return { status: -1, text: String(e) }; }
  }, { url: ENDPOINT, body });
  return parseShopeeResponse(res); // map error code như bảng dưới
}
```

### Map kết quả → error_code
| Tình huống | error_code | Hành động |
|---|---|---|
| status 401 / "unauthorized" | `LOGIN_REQUIRED` | dừng, set session login_required, **không retry**, alert |
| `batchCustomLink[0].failCode` có giá trị | `FAIL_CODE` | → **web UI fallback** |
| `batchCustomLink` rỗng / `shortLink` rỗng | `NO_DATA` | nghi CAPTCHA → alert người vào giải |
| status -1 / khác 200 | `HTTP`/`TIMEOUT` | retry giới hạn rồi alert |
| OK | — | trả `shortLink` (+ `longLink`) |

## 4. Bước 3 — Web UI fallback (khi FAIL_CODE)
Mở `https://affiliate.shopee.vn/offer/custom_link`:
1. Nhập link gốc vào textarea.
2. Điền `#customLink_sub_id1..4` (strip `[a-zA-Z0-9]`).
3. Bấm nút "Lấy link"/"Get Link".
4. Đọc popup `div.ant-modal textarea, div.ant-modal input[type=text]` → lọc giá trị chứa
   `s.shopee.vn`/`shope.ee`/`shopee.vn`.

(selectors có thể đổi — để trong config giống reference, dễ sửa khi Shopee thay UI.)

## 5. SubID (tracking)
```ts
{ subId1: "zerun", subId2: "auto", subId3: `src_${sourceShortId}`, subId4: slug(productName), subId5: "" }
```
Có thể map `subId3` = id source để biết deal đến từ đâu. Slug chỉ `[a-zA-Z0-9]`, max ~24 ký tự.

## 6. Rút gọn link (optional, sau convert)
Có thể đổi `s.shopee.vn` → `shope.ee` hoặc qua dịch vụ rút gọn — xem
[reference §4](../reference-shopee-seeding-bot.md#4-link-shortening-post-step-tách-khỏi-affiliate).
Không bắt buộc cho M1.

## 7. Lỗi & alert
Khi cả API lẫn web UI fail → ghi `ContentLink.status="failed"` + đẩy vào **manual convert queue**
(plan M1·D6) và (M2) gửi Telegram alert kèm hướng dẫn login lại/giải CAPTCHA.

## Done checklist
- [ ] `mode` cấu hình được (web / accesstrade / auto) + chuỗi fallback linh động
- [ ] clean URL strip tracking params
- [ ] convertViaApi qua `page.evaluate` + map đủ error_code
- [ ] web UI fallback đọc được link từ popup
- [ ] AccessTrade dùng được như đường thay thế (không cần session)
- [ ] subId đầy đủ, slug hợp lệ
- [ ] fail → manual queue, không retry khi LOGIN_REQUIRED
- [ ] selectors để trong config
