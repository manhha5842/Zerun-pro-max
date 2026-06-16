# Tutorial — Vision / OCR cho ảnh deal (M3)

> Chỉ chạy khi caption mơ hồ. Schema `DealAnalysis.imageDecision.needVisionCheck` đã có
> ([schemas.ts](../../packages/core/src/ai/schemas.ts)). Mục tiêu: đọc giá/mã/sản phẩm từ ảnh.

## 1. Khi nào gọi (tiết kiệm cost)
Chỉ gọi vision khi **cả 2**: có ảnh **và** (`needVisionCheck === true` hoặc rule đánh dấu caption mơ hồ).
Không bao giờ gọi vision cho mọi tin.

## 2. Hai hướng
| Hướng | Khi nào | Ghi chú |
|---|---|---|
| **Vision LLM** (multimodal) | mặc định | gửi ảnh + prompt cho model vision qua 9router/provider (model hỗ trợ image). Cùng `AiProvider` nhưng message có `image_url`. |
| **OCR thuần** (tesseract/python) | chỉ cần text trong ảnh, tiết kiệm | `tesseract.js` hoặc helper Python; rẻ nhưng không "hiểu" ngữ cảnh. |

Khuyến nghị M3: vision LLM trước (đỡ hạ tầng), OCR thuần để sau nếu cần giảm cost.

## 3. Vision qua provider OpenAI-compatible
```ts
messages: [
  { role: "system", content: VISION_PROMPT },
  { role: "user", content: [
    { type: "text", text: "Đọc giá/mã/sản phẩm trong ảnh, trả JSON." },
    { type: "image_url", image_url: { url: dataUrlOrHttpUrl } }
  ]}
]
```
- Ảnh: dùng URL công khai, hoặc base64 data URL từ file trong `storage/media`.
- Output: schema nhỏ riêng `{ price?, voucherCode?, productName?, textInImage }` (Zod validate).

## 4. Ghép vào pipeline
Trong content-process: sau AI text classify, nếu `needVisionCheck` → gọi vision → merge kết quả
vào `DealAnalysis` (điền `price/voucherCode/productName` còn thiếu) → tính lại decision/confidence.

## 5. Vị trí
- `packages/worker-core/src/ai/vision.ts` (gọi provider vision).
- Prompt: `packages/worker-core/src/ai/system-prompt.ts` (thêm VISION_PROMPT).

## Done checklist
- [ ] chỉ gọi khi hasImage && needVisionCheck
- [ ] vision provider trả JSON (Zod validate)
- [ ] merge vào DealAnalysis + tính lại decision
- [ ] giới hạn 1 ảnh/lần, log token vision riêng
