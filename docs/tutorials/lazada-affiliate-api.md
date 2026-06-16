# Tutorial — Lazada affiliate API + Affiliate router

> Bạn đã có Lazada Affiliate account/API → làm provider riêng (không cần web như Shopee).
> File này cũng mô tả **Affiliate router** (D1) chọn provider theo network.

## Phần A — Affiliate router (D1)

Hiện `registry.ts` chỉ có 1 `affiliateAdapter` (AccessTrade). Đổi thành router:

```
packages/adapters/src/affiliate/
  router.ts          # AffiliateService: chọn provider theo network
  accesstrade.ts     # (đã có)
  shopee-web.ts      # (tutorial shopee)
  lazada-api.ts      # (file này)
  manual.ts          # provider "không tự convert" → đẩy manual queue
```

```ts
// router.ts
export class AffiliateService {
  constructor(private providers: Record<LinkNetwork, AffiliateAdapter>) {}
  async convert(input: ConvertLinkInput): Promise<ConvertLinkResult> {
    const provider = this.providers[input.network] ?? this.providers["unknown"];
    return provider.convert(input);
  }
}
```
Map mặc định M1:
```
shopee      → ShopeeWebAffiliateProvider
lazada      → LazadaApiProvider
tiktok_shop → AccessTradeAffiliateProvider
unknown/*   → AccessTrade (nếu hỗ trợ) hoặc ManualProvider
```
`content-process.ts` đang gọi `registry.affiliateAdapter.convert(...)` → đổi sang
`registry.affiliateService.convert(...)`. Giữ nguyên phần lưu `ContentLink`.

## Phần B — Lazada Affiliate Open API

> ⛔ **Trạng thái credential:** LiteApp Key / Secret / User Token đang **Pending**. Khi còn pending
> thì **chỉ thiết kế & code module trước**, chưa convert thật được. Flow mở quyền:
> Apply API → Get user token → Development & Testing → Online API Call.
> Cần đủ: account Affiliate mở Open API, LiteApp Key approved, LiteApp Secret, User Token, endpoint
> production gọi được, input là Lazada PDP/ALP URL · productId · offerId hợp lệ.

### 1. Endpoint chính — `/marketing/getlink` (Batch get link)
Đây là endpoint **nên dùng nhất**: batch + nhận trực tiếp URL/productId/offerId.

- **Host:** mẫu tài liệu dùng `https://api.lazada.sg/rest`. Với account VN **phải kiểm tra trong
  Lazada Open Platform console** xem host đúng là `api.lazada.sg` hay region khác.
- **Path:** `/marketing/getlink`
- **Auth:** ngoài `userToken` (business param), request vẫn cần **system params + sign HMAC** của
  Lazada Open Platform (`app_key`, `timestamp`, `sign_method=sha256`, `sign`). Xem §2.

#### Request params
| Param | Bắt buộc | Ý nghĩa |
|---|---|---|
| `userToken` | ✅ | token affiliate gọi API |
| `inputType` | ✅ | `productId` \| `url` \| `offerId` |
| `inputValue` | ✅ | giá trị cần convert; nhiều giá trị cách nhau dấu phẩy, **tối đa 100/lần** |
| `mmCampaignId` | — | khi convert link MM campaign |
| `dmInviteId` | — | khi convert link DM invite |
| `subAffId` | — | sub affiliate id |
| `subId1`..`subId6` | — | tracking sub id tùy chỉnh |

#### 3 mode theo `inputType`
| inputType | inputValue | Response list |
|---|---|---|
| `url` ⭐ (hợp Zerun nhất) | Lazada PDP/ALP URL | `urlBatchGetLinkInfoList` |
| `productId` | product id (csv) | `productBatchGetLinkInfoList` |
| `offerId` | offer id (csv) | `offerBatchGetLinkInfoList` |

#### Field response (mode `url`)
`originalUrl, productId, productName, regularPromotionLink, regularCommission, dmPromotionLink,
dmCommission, mmPromotionLink, mmCommission, mmCampaignName, errorInfoList`.
(mode `productId`: tương tự nhưng không có originalUrl. mode `offerId`:
`offerId, offerName, offerPromotionLink, offerStartTime, offerEndTime, offerType`.)

#### Chọn link theo thứ tự ưu tiên (DM/MM thường hoa hồng tốt hơn)
```
1. dmPromotionLink
2. mmPromotionLink
3. regularPromotionLink
(offer mode → offerPromotionLink)
→ nếu không có link nào: failed / manual review
```

### 2. Ký request (system params)
Quy tắc sign Lazada/AliExpress-style:
1. Gom tất cả params (system `app_key`,`timestamp`,`sign_method=sha256` + business `userToken`,`inputType`,`inputValue`,`subId*`...).
2. Sort key alphabet, nối `key+value` liền nhau.
3. Prepend `apiPath`: `apiPath + concat(sortedKV)`.
4. `sign = HMAC_SHA256(app_secret, payload).hexUpperCase()`.
```ts
import { createHmac } from "node:crypto";
function sign(apiPath: string, params: Record<string,string>, appSecret: string) {
  const sorted = Object.keys(params).sort();
  const base = apiPath + sorted.map(k => k + params[k]).join("");
  return createHmac("sha256", appSecret).update(base, "utf8").digest("hex").toUpperCase();
}
```
> ⚠️ `userToken` có nằm trong tập params ký hay không tùy quy ước của Lazada — verify khi có token thật.

### 3. SubID scheme cho Zerun (tracking nguồn)
Report của Lazada trả về `affiliateSubId` + `subId1~subId6` → biết đơn đến từ đâu. Quy ước:
```
subId1 = zerun
subId2 = source platform   (telegram | zalo | facebook)
subId3 = source account/group id
subId4 = content id
subId5 = target platform   (telegram_channel | facebook_group | zalo_group)
subId6 = campaign tag / ai_profile (auto | manual | ...)
```

### 4. Skeleton provider (batch)
```ts
// lazada-api.ts
export class LazadaApiProvider implements AffiliateAdapter {
  constructor(private cfg: {
    appKey: string; appSecret: string; userToken: string;
    endpoint: string; apiPath: string; // apiPath = "/marketing/getlink"
  }) {}

  async convertBatch(urls: string[], sub: Record<string,string>): Promise<ConvertLinkResult[]> {
    const out: ConvertLinkResult[] = [];
    for (const chunk of chunkArray(urls, 100)) {          // ≤100/lần
      const params: Record<string,string> = {
        app_key: this.cfg.appKey,
        timestamp: String(Date.now()),
        sign_method: "sha256",
        userToken: this.cfg.userToken,
        inputType: "url",
        inputValue: chunk.join(","),
        ...sub, // subId1..6, subAffId
      };
      params.sign = sign(this.cfg.apiPath, params, this.cfg.appSecret);
      const res = await fetch(`${this.cfg.endpoint}${this.cfg.apiPath}?${new URLSearchParams(params)}`);
      const data = await res.json();
      const list = data?.urlBatchGetLinkInfoList ?? [];
      const byUrl = new Map(list.map((i: any) => [i.originalUrl, i]));
      for (const url of chunk) {
        const item = byUrl.get(url);
        const link = pickBestPromotionLink(item); // dm > mm > regular
        out.push({ converted: link ?? null, network: "lazada",
                   success: Boolean(link),
                   error: link ? undefined : describeError(item, data) });
      }
    }
    return out;
  }
  // convert(input) đơn lẻ = convertBatch([input.url]) phục vụ interface AffiliateAdapter
}

function pickBestPromotionLink(item: any): string | null {
  if (!item || (item.errorInfoList?.length)) return null;
  return item.dmPromotionLink || item.mmPromotionLink || item.regularPromotionLink || null;
}
```

### 5. Batch flow trong Zerun
```
extractLinks() → filter network=lazada → expandShortLinks(s.lazada.vn)
→ chunk ≤100 → /marketing/getlink (inputType=url) → map theo originalUrl
→ pickBestPromotionLink → replaceLinksInText → save ContentLink
→ link fail → manual queue
```

### 6. Status & lỗi
| status | khi nào |
|---|---|
| `success` | có promotion link hợp lệ (c.lazada / tracking link) |
| `failed` | API lỗi / token lỗi / offer-product not found / không hợp lệ |
| `partial_success` | batch có link OK lẫn link fail |
| `manual_required` | không convert được nhưng vẫn giữ vào queue xử lý tay |

**Điều kiện convert thành công:** `success=true` **và** item không nằm `errorInfoList` **và** có ≥1
promotion link **và** link là dạng `c.lazada...`/tracking hợp lệ.

**Lỗi thường gặp cần handle:** user token sai/hết hạn · app key/secret chưa approve · link không phải
PDP/ALP · short link chưa expand · product/offer không tồn tại (`errorCode=2001 offer not found`) ·
không có commission · không thuộc quốc gia/account · batch >100 · QPS limit · `success=true` nhưng
item có `errorInfoList`.

### 7. Config (.env)
```
LAZADA_APP_KEY=...
LAZADA_APP_SECRET=...      # M2: mã hoá
LAZADA_USER_TOKEN=...      # affiliate user token (có thể hết hạn → cần refresh)
LAZADA_ENDPOINT=https://api.lazada.sg/rest   # verify host VN trong console
LAZADA_API_PATH=/marketing/getlink
```

### 8. Endpoint phụ (tham khảo, KHÔNG ưu tiên)
- `/marketing/product/link` — convert 1 productId, trả `trackingLink, commissionRate, productName`.
- Zerun **ưu tiên `/marketing/getlink`** vì batch + nhận URL trực tiếp.

## Done checklist
- [ ] `AffiliateService` router theo network, thay chỗ gọi trong content-process
- [ ] `sign()` HMAC-SHA256 đúng (test 1 request mẫu khi có credential)
- [ ] provider `inputType=url` batch ≤100, map theo `originalUrl`
- [ ] `pickBestPromotionLink` ưu tiên dm > mm > regular
- [ ] subId1..6 theo scheme tracking
- [ ] status success/failed/partial_success/manual_required + handle errorInfoList
- [ ] config .env, host VN verify, userToken refresh được
- [ ] ⛔ test thật khi User Token hết Pending (trước đó chỉ build module + unit test sign)
- [ ] ManualProvider cho network chưa hỗ trợ
