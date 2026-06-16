# Tutorial — AI provider 9router (OpenAI-compatible)

> Triển khai `AiProvider` cho 9router. Vì 9router OpenAI-compatible, **cùng một class** dùng được
> cho DeepSeek/MiniMax/OpenAI sau này (chỉ đổi `baseUrl`/`apiKey`/`model`).
> Interface đã scaffold: [`packages/core/src/ai/provider.ts`](../../packages/core/src/ai/provider.ts).
> Logic gốc port từ `ninerouter.py` — xem [reference](../reference-shopee-seeding-bot.md#2-9router--ai-client-openai-compatible).

## 1. Đặt file ở đâu

Core **không được phụ thuộc network**. Vì vậy:
- Interface + parse/retry: `packages/core/src/ai/provider.ts` (đã có).
- Implementation gọi HTTP: đặt ở **worker** → `packages/worker-core/src/ai/openai-compatible-provider.ts` (mới).

## 2. Config (bảng `AiConfig` đã có)

`AiConfig { provider, name, config: Json, isActive }`. Lưu `config` dạng:

```json
{
  "baseUrl": "https://<9router-host>",
  "apiKey": "env:NINEROUTER_KEY",
  "model": "openai/gpt-5",
  "timeout": 60,
  "retryCount": 2,
  "healthCheck": true,
  "temperature": 0.3,
  "maxTokens": 1024
}
```

- `apiKey` có thể là `"env:NAME"` → đọc từ `process.env` (đừng lưu key thật vào DB khi chưa làm M2 mã hoá).
- Cho phép `.env`: `NINEROUTER_URL`, `NINEROUTER_KEY`, `AI_MODEL`.

## 3. Các điểm BẮT BUỘC giữ đúng (đã học từ ninerouter.py)

1. **Normalize baseUrl:** bỏ `/` cuối; nếu kết thúc bằng `/v1` thì cắt đi (ta tự nối `/v1/...`).
2. **Header `User-Agent`** — Cloudflare chặn request thiếu UA. Set `Mozilla/5.0 ... Chrome/124 ...`.
3. **Health check (optional):** `GET {base}/api/health` → `{ ok: true }`. Cache OK 5', fail 30s.
4. **Auto model:** nếu `model` rỗng → `GET {base}/v1/models` lấy `data[0].id`.
5. **Chat:** `POST {base}/v1/chat/completions` với
   `{ model, messages, stream:false, temperature, max_tokens }`.
6. **Đọc content:** `data.choices[0].message.content` — content có thể là `string` HOẶC `array[{text}]`.
7. **Retry:** HTTP 408/409/425/429/5xx hoặc response rỗng → retry, backoff `delay*attempt`.
8. **Mask token:** nếu key chứa `•`/`***`/`a...b` → coi như chưa cấu hình, bỏ qua.

## 4. Skeleton (TS)

```ts
// packages/worker-core/src/ai/openai-compatible-provider.ts
import type { AiProvider, AiClassifyInput, AiUsage } from "@zerun/core";

export type OpenAiCompatibleConfig = {
  baseUrl: string; apiKey: string; model?: string;
  timeout?: number; retryCount?: number; healthCheck?: boolean;
  temperature?: number; maxTokens?: number;
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = "openai-compatible";
  private model?: string;
  constructor(private cfg: OpenAiCompatibleConfig) {
    this.cfg.baseUrl = normalizeBase(cfg.baseUrl);
    this.model = cfg.model;
  }
  async complete(input: AiClassifyInput): Promise<{ text: string; usage?: AiUsage }> {
    const model = this.model ?? (await this.resolveModel());
    const body = {
      model,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: JSON.stringify(input.context) }
      ],
      stream: false,
      temperature: this.cfg.temperature ?? 0.3,
      max_tokens: this.cfg.maxTokens ?? 1024
    };
    const data = await this.post("/v1/chat/completions", body); // có retry bên trong
    return { text: extractContent(data), usage: mapUsage(data.usage) };
  }
  // resolveModel(): GET /v1/models -> data[0].id (cache)
  // post(): fetch với header UA+Bearer, retry theo isRetryable
}

function normalizeBase(u: string) {
  u = u.trim().replace(/\/+$/, "");
  return u.endsWith("/v1") ? u.slice(0, -3).replace(/\/+$/, "") : u;
}
function extractContent(data: any): string {
  const c = data?.choices?.[0]?.message?.content ?? "";
  return Array.isArray(c) ? c.map((p: any) => p?.text ?? "").join("") : String(c);
}
```

## 5. Ghép vào pipeline

Worker dựng provider từ `AiConfig` → gọi `classifyWithRetry(provider, { context, systemPrompt })`
(đã có trong core) → nhận `DealAnalysis` đã validate Zod. Xem cách wire ở
[milestone-1-implementation-plan.md](../milestone-1-implementation-plan.md) task **C1**.

## 6. System prompt tĩnh (cho cache + cost)

Giữ **một** static string đầu request (rules + DealAnalysis schema + 2–3 few-shot), phần động
chỉ là `context` (user message). Đặt ở `packages/worker-core/src/ai/system-prompt.ts`. Static
giống nhau giữa các call → provider cache tốt, đỡ token.

## 7. Test connection

Làm 1 hàm `testConnection()` giống `test_ninerouter_connection`: health → model → 1 call nhỏ
ép trả JSON `{"ok":true}`. Surface ra trang Settings (đã có `SettingsPage.tsx`).

## Done checklist (copy vào commit cuối)
- [ ] normalizeBase + UA header + health + auto-model + retry
- [ ] đọc content string|array
- [ ] dựng từ AiConfig/.env, mask token
- [ ] testConnection hiện ở Settings
- [ ] `classifyWithRetry` trả DealAnalysis hợp lệ với 1 tin thật
