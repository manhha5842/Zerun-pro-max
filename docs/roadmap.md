# Zerun — Roadmap & Index

Local-first affiliate automation: collect (Zalo/Telegram) → process (rule + AI) →
convert affiliate → repost (Zalo/Telegram/...). Xem tổng quan kiến trúc:
[unified-upgrade-plan.md](unified-upgrade-plan.md).

## Plans (làm theo thứ tự)

| Milestone | Mục tiêu | File |
|---|---|---|
| **M1** | Flow dọc đầy đủ có review thủ công | [milestone-1-implementation-plan.md](milestone-1-implementation-plan.md) |
| **M2** | Hardening: bảo mật, alert, bán tự động | [milestone-2-implementation-plan.md](milestone-2-implementation-plan.md) |
| **M3** | Mở rộng: nhiều target, vision, nhiều network | [milestone-3-implementation-plan.md](milestone-3-implementation-plan.md) |
| **M4** | Scale & vận hành 24/7 từ xa | [milestone-4-implementation-plan.md](milestone-4-implementation-plan.md) |

## Tutorials (task khó — plan trỏ vào đây)

| Chủ đề | File | Dùng ở |
|---|---|---|
| AI provider 9router (OpenAI-compatible) | [tutorials/ai-provider-9router.md](tutorials/ai-provider-9router.md) | M1·A |
| Session/Profile manager (Playwright + zca-js/GramJS) | [tutorials/session-profile-manager.md](tutorials/session-profile-manager.md) | M1·0 |
| Zalo personal qua zca-js | [tutorials/zalo-zca-js.md](tutorials/zalo-zca-js.md) | M1·B |
| Dedup đa nguồn | [tutorials/dedup-multi-source.md](tutorials/dedup-multi-source.md) | M1·B |
| Shopee affiliate converter | [tutorials/shopee-affiliate-converter.md](tutorials/shopee-affiliate-converter.md) | M1·D |
| Lazada affiliate API | [tutorials/lazada-affiliate-api.md](tutorials/lazada-affiliate-api.md) | M1·D |
| Mã hoá credentials/session | [tutorials/credentials-encryption.md](tutorials/credentials-encryption.md) | M2 |
| Vision/OCR cho ảnh deal | [tutorials/vision-ocr.md](tutorials/vision-ocr.md) | M3 |
| Migrate Postgres + Redis/BullMQ | [tutorials/postgres-redis-migration.md](tutorials/postgres-redis-migration.md) | M4 |
| Deploy 24/7 + Cloudflare Access | [tutorials/cloudflare-access-deploy.md](tutorials/cloudflare-access-deploy.md) | M4 |

Tham khảo gốc (Python bot): [reference-shopee-seeding-bot.md](reference-shopee-seeding-bot.md).

## Quy tắc thực thi (áp dụng cho MỌI plan)

1. **Tick theo từng task, ngay khi xong** — sửa `- [ ]` → `- [x]` trong chính file plan. KHÔNG gom tick một lượt cuối milestone.
2. Mỗi task có dòng **`Done khi:`** — chỉ được tick khi thỏa đúng điều kiện đó (không tick theo cảm tính).
3. Trước khi bắt đầu task có nhãn 📘 → **mở tutorial tương ứng đọc trước**.
4. `npm run typecheck` phải **xanh** trước khi tick task có code; task có test thì test phải pass.
5. Commit nhỏ theo từng task/nhóm (message: `M1-D2: shopee converter`).
6. **Không sang milestone sau** khi milestone trước chưa tick hết (trừ task gắn `(optional)`).
7. Task bị chặn → đánh dấu `- [ ] ⛔ (blocked: lý do)` thay vì bỏ trống, để biết tại sao dừng.
