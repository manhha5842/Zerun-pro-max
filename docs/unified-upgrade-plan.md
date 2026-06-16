# Zerun Unified — Kế hoạch nâng cấp (điều chỉnh theo hiện trạng code)

> Bản này **thay thế thứ tự roadmap** trong tài liệu `zerun_unified_architecture` gốc.
> Lý do: phần lớn "Phase 1, 2, 5, 7" của tài liệu gốc **đã tồn tại** trong repo. Việc còn
> thiếu thật sự là **Rule engine + AI pipeline**, nên được đôn lên đầu.

## 1. Đối chiếu hiện trạng

Đã có trong repo (không cần làm lại):

- Monorepo: `apps/{api,web-admin}`, `packages/{adapters,core,db,shared,worker-core}`.
- 28 Prisma models, gồm `SourceAccount`, `TargetAccount`, `RoutingRule`, `Content`,
  `ContentLink`, `PublishAttempt`, `Schedule`, `CommentQueue`.
- `CrawlJob` + `CrawlResult` ≈ **RawMessage** (đã có `externalId`, `author`, `originalText`,
  `media`, `comments`, `links`, `postedAt`, `status`, `contentId`, unique-dedup).
- `AutoConversionRule/Run/Link/Media` ≈ **AffiliateConversion** (đã có lịch sử convert).
- Adapters: `telegram` (GramJS/StringSession), `zalo-personal` (`zca-js`), `facebook`,
  `instagram`, `threads`, `x`; affiliate `accesstrade`.
- 25 trang web-admin (Dashboard, Sources, Routing, Schedules, Crawl, AutoConversion,
  ConvertLink, History, Failed, PendingComments, ...).
- Worker processors: `source-crawl`, `crawl-job`, `content-process`, `publish`, `schedule`,
  `comment`, `fb-post`, `platform-health`.
- Bảng `AiConfig` (provider/name/config) — **rỗng, chưa có code AI**.

Còn thiếu (gap thật sự):

1. **Rule engine** — `packages/core/src/rules/` chưa tồn tại (chỉ có `links/detect.ts`).
2. **AI pipeline** — `packages/core/src/ai/` chưa tồn tại; `AiConfig` chưa được dùng.
3. **Link role + expand short link** — `detect.ts` mới detect network, chưa có role/expand.
4. Hoàn thiện kiểm thử tài khoản thật cho Zalo cá nhân (`zca-js`).
5. Vision/OCR.
6. Mã hoá credentials — `SourceAccount.credentials` và `PlatformSession.data` đang plaintext.
7. Service 24/7 (PM2/NSSM) + siết Cloudflare Access.

## 2. Quyết định data model

**Mở rộng model hiện có, KHÔNG tạo `RawMessage`/`AffiliateConversion` mới.**

- "RawMessage" = `CrawlResult`. Nếu cần, thêm cột: `senderId`, `replyToExternalId`,
  `contentHash`, `rawPayload Json`.
- "AffiliateConversion" = `AutoConversionLink` (+ `ContentLink` cho luồng content).
- Kết quả AI lưu vào `Content.metadata` (Json) + `Content.draftText` (caption rewrite);
  trạng thái suy ra theo `confidence` (xem §4).

## 3. Vị trí AI/Rule trong luồng

Hiện `worker-core/processors/content-process.ts` làm: detect links → convert affiliate →
apply text → resolve routing → set status. Chèn thêm **trước bước convert**:

```
CrawlResult/Content.originalText
  → RuleEngine.evaluate()      (code, packages/core/src/rules)
  → ContextBuilder.build()     (payload ngắn cho AI)
  → AiProvider.classify()      (DealAnalysis JSON + Zod validate)
  → quyết định: skip / require_review / convert+rewrite
  → (đoạn convert affiliate hiện có) → routing → status
```

## 4. Auto decision (ngưỡng)

```
confidence >= 0.85 + rule "safe"  → ready_to_publish (nếu routing auto)
0.65 .. 0.84                       → waiting (require review)
< 0.65                            → skipped / review
```

Rule "safe" = đúng 1 link affiliate-supported, không phải reply/comment, không chứa
YouTube/Form/Telegram-group cần giữ, ảnh không mơ hồ.

## 5. Roadmap điều chỉnh

| Sprint | Nội dung | Ngày | Trạng thái |
|---|---|---|---|
| S1 | Rule engine + link enrich (role, expand, glossary, source-profile) | 3–4 | scaffold xong |
| S2 | AI classifier (provider, DealAnalysis Zod, context-builder, retry) | 5–7 | scaffold xong |
| S3 | Wire AI/Rule vào `content-process` + review UI (reason/confidence/batch) | 3–4 | chưa |
| S4 | Zalo cá nhân (`zca-js`) + kiểm thử tài khoản thật | 4–6 | đang triển khai |
| S5 | Mã hoá credentials/session + PM2/NSSM + Cloudflare Access | 2–3 | chưa |

> S5 nên đôn sớm hơn nếu sắp expose dashboard ra Internet (đang plaintext = rủi ro).

## 6. Việc đã scaffold trong lần này

- `packages/core/src/rules/{glossary,source-profile,rule-engine}.ts`
- `packages/core/src/ai/{schemas,provider,context-builder}.ts`
- `packages/core/src/links/detect.ts` mở rộng: `detectLinkRole`, `expand` placeholder.
- Export qua `packages/core/src/index.ts`; thêm `zod` vào `@zerun/core`.

Tất cả là nền type-safe + pure function, **chưa gọi API thật** và **chưa sửa worker** —
để S3 wire vào và thêm provider key.
