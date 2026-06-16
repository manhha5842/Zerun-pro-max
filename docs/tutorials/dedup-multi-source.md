# Tutorial — Dedup đa nguồn

> Khi nhiều group/channel cùng đăng một deal, chỉ xử lý & đăng lại **một lần**.
> Hai tầng: (1) dedup trong cùng nguồn (đã có), (2) dedup **chéo nguồn** (làm mới).

## 1. Tầng 1 — trùng trong cùng nguồn (ĐÃ CÓ)
`CrawlResult @@unique([platform, sourceRef, externalId])` — cùng message id từ cùng group sẽ
không lưu 2 lần. Không cần làm gì thêm.

## 2. Tầng 2 — trùng nội dung chéo nguồn (MỚI)

### 2a. Thêm cột (mở rộng model, KHÔNG tạo model mới)
Trong `CrawlResult` (và/hoặc `Content`) thêm:
```prisma
contentHash  String?
@@index([contentHash])
```
Trên `Content` thêm `duplicateOfId String?` để trỏ về bản gốc.

### 2b. Chuẩn hoá text trước khi hash
Mục tiêu: hai tin "giống về bản chất" ra cùng hash dù khác emoji/khoảng trắng/thứ tự link.
```ts
function normalizeForHash(text: string, links: string[]): string {
  const t = text.toLowerCase()
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/g, "")     // bỏ URL khỏi text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")  // bỏ emoji/ký tự đặc biệt
    .replace(/\s+/g, " ").trim();
  // link chuẩn hoá: chỉ host + path, bỏ query tracking, sort
  const normLinks = links.map(stripTrackingAndQuery).sort().join("|");
  return `${t}::${normLinks}`;
}
import { createHash } from "node:crypto";
const contentHash = createHash("sha1").update(normalizeForHash(text, links)).digest("hex");
```
> Quyết định: hash nên dựa **chủ yếu vào link sản phẩm gốc** (sau khi strip tracking) — vì caption
> hay bị sửa nhẹ giữa các nguồn nhưng link sản phẩm thường giống. Cân nhắc 2 hash:
> `linkHash` (chỉ link) + `textHash` (chỉ text) và coi là trùng nếu **linkHash trùng**.

### 2c. Cửa sổ thời gian
Chỉ coi là trùng nếu xuất hiện trong **N giờ** (vd 48h) — cùng deal đăng lại sau 1 tháng có thể là
campaign mới. Query: `contentHash = ? AND createdAt > now()-48h`.

### 2d. Luồng xử lý khi tạo Content từ CrawlResult
```
tính contentHash (ưu tiên linkHash)
nếu tồn tại Content gần đây cùng hash:
    → đánh dấu CrawlResult.status = "duplicate"
    → (tùy chọn) tạo Content nhẹ với duplicateOfId = bản gốc, status="skipped"
    → KHÔNG chạy AI, KHÔNG convert, KHÔNG publish
ngược lại:
    → tạo Content mới, tiếp pipeline
```

### 2e. "Gộp nguồn" (tùy chọn nâng cao)
Lưu danh sách nguồn đã thấy cùng deal vào `Content.metadata.seenFromSources[]` để biết deal hot
(nhiều nguồn cùng đăng) — phục vụ trust scoring sau này.

## 3. Vị trí code
- Hàm hash: `packages/core/src/links/dedup.ts` (mới, pure) + export ở `core/index.ts`.
- Áp dụng: bước `CrawlResult → Content` trong worker (plan M1·B3/B4).

## Done checklist
- [ ] cột `contentHash` (+ index) và `duplicateOfId`
- [ ] `normalizeForHash` + linkHash/textHash (pure, có unit test)
- [ ] cửa sổ thời gian N giờ
- [ ] tin trùng → status="duplicate", không chạy AI/convert/publish
- [ ] (optional) metadata.seenFromSources
