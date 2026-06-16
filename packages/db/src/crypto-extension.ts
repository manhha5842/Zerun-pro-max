import { readCredentials, readSessionData, writeCredentials, writeSessionData } from "@zerun/shared";
import { Prisma } from "@prisma/client";

/**
 * Prisma client extension mã hoá trong suốt credentials/session nhạy cảm:
 * encrypt khi ghi (create/update/upsert), decrypt khi đọc kết quả.
 * Mọi nơi import `prisma` từ `@zerun/db` đều được hưởng, không cần rải encrypt/decrypt.
 *
 * - `credentials`/`config`: mã hoá field-level (chỉ field nhạy cảm bên trong).
 * - `PlatformSession.data`: mã hoá cả object.
 *
 * (Prisma 6 đã bỏ middleware `$use`, nên dùng client extension.)
 */

type SecretMode = "fields" | "session";

const MODEL_SECRETS: Record<string, Record<string, SecretMode>> = {
  SourceAccount: { credentials: "fields" },
  TargetAccount: { credentials: "fields" },
  AiConfig: { config: "fields" },
  PlatformSession: { data: "session" }
};

function encryptRecord(model: string, data: Record<string, unknown>): void {
  const spec = MODEL_SECRETS[model];
  if (!spec || !data || typeof data !== "object") return;
  for (const [field, mode] of Object.entries(spec)) {
    if (data[field] === undefined) continue;
    data[field] = mode === "session" ? writeSessionData(data[field]) : writeCredentials(data[field]);
  }
}

function decryptRecord(model: string, record: unknown): void {
  const spec = MODEL_SECRETS[model];
  if (!spec || !record || typeof record !== "object") return;
  const row = record as Record<string, unknown>;
  for (const [field, mode] of Object.entries(spec)) {
    if (row[field] == null) continue;
    row[field] = mode === "session" ? readSessionData(row[field]) : readCredentials(row[field]);
  }
}

const WRITE_OPS = new Set(["create", "update", "upsert", "createMany", "updateMany"]);

export const cryptoExtension = Prisma.defineExtension({
  name: "zerun-credentials-encryption",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const data = args as Record<string, unknown> | undefined;

        if (model && MODEL_SECRETS[model] && data && WRITE_OPS.has(operation)) {
          if (operation === "upsert") {
            if (data.create) encryptRecord(model, data.create as Record<string, unknown>);
            if (data.update) encryptRecord(model, data.update as Record<string, unknown>);
          } else {
            const payload = data.data;
            if (Array.isArray(payload)) payload.forEach((item) => encryptRecord(model, item as Record<string, unknown>));
            else if (payload) encryptRecord(model, payload as Record<string, unknown>);
          }
        }

        const result = await query(args);

        if (model && MODEL_SECRETS[model] && result) {
          if (Array.isArray(result)) result.forEach((row) => decryptRecord(model, row));
          else decryptRecord(model, result);
        }

        return result;
      }
    }
  }
});
