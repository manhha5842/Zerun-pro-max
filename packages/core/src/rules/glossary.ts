/**
 * Glossary tiếng lóng deal — dùng để bơm ngữ cảnh ngắn vào AI payload,
 * và để rule engine nhận diện tín hiệu "deal" mà không cần gọi AI.
 */
export const DEAL_GLOSSARY: Record<string, string> = {
  "back mã": "mã giảm giá quay lại, cần vào lưu hoặc dùng nhanh",
  "back extra": "mã Extra xuất hiện lại",
  "áp mã": "sử dụng mã giảm giá",
  "áp xu": "dùng xu để giảm thêm",
  "max xu": "áp được lượng xu tối đa",
  "áp list": "danh sách sản phẩm dùng được mã",
  "săn sale": "canh mua khi có mã/giá tốt",
  "mã facebook": "mã lấy từ Facebook campaign",
  "load liên tục": "refresh liên tục vào link để lưu mã",
  "0h": "khung giờ 00:00",
  "9h": "khung giờ 09:00",
  "12h": "khung giờ 12:00",
  svip: "ShopeeVip"
};

/** Trả về các cụm glossary xuất hiện trong text (đã lowercase, bỏ dấu giữ nguyên). */
export function matchGlossary(text: string): Record<string, string> {
  const haystack = text.toLowerCase();
  const matched: Record<string, string> = {};
  for (const [term, meaning] of Object.entries(DEAL_GLOSSARY)) {
    if (haystack.includes(term)) matched[term] = meaning;
  }
  return matched;
}
