/**
 * Migration một lần: mã hoá credentials/session plaintext có sẵn trong DB.
 *
 *   tsx packages/db/src/migrate-encrypt.ts
 *
 * Idempotent: field nào đã `isEncrypted` được bỏ qua → chạy lại không hỏng.
 * Dùng RAW PrismaClient (không qua middleware mã hoá) để đọc đúng giá trị đã lưu
 * và quyết định có cần encrypt hay không.
 */
import { PrismaClient } from "@prisma/client";
import { hasMasterKey, isEncrypted, writeCredentials, writeSessionData } from "@zerun/shared";
import { ensureDatabaseReady } from "./client.js";

type Counter = { scanned: number; encrypted: number };

/** Đệ quy: có field nhạy cảm nào còn plaintext không (để biết cần ghi lại). */
function hasPlainSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasPlainSecret);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(([key, raw]) => {
      const k = key.toLowerCase();
      const sensitive = /(secret|token|password|apikey|api_key|cookie|session|imei)/.test(k);
      if (sensitive && typeof raw === "string" && raw.length > 0 && !isEncrypted(raw)) return true;
      return hasPlainSecret(raw);
    });
  }
  return false;
}

async function migrateCredentials(
  rows: Array<{ id: string; credentials: unknown }>,
  update: (id: string, credentials: unknown) => Promise<unknown>,
  counter: Counter
) {
  for (const row of rows) {
    counter.scanned += 1;
    if (!hasPlainSecret(row.credentials)) continue;
    await update(row.id, writeCredentials(row.credentials));
    counter.encrypted += 1;
  }
}

async function main() {
  await ensureDatabaseReady();

  if (!hasMasterKey()) {
    console.error("✖ ZERUN_MASTER_KEY chưa cấu hình — không có gì để mã hoá. Đặt key rồi chạy lại.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const totals: Record<string, Counter> = {
      SourceAccount: { scanned: 0, encrypted: 0 },
      TargetAccount: { scanned: 0, encrypted: 0 },
      AiConfig: { scanned: 0, encrypted: 0 },
      PlatformSession: { scanned: 0, encrypted: 0 }
    };

    await migrateCredentials(
      await prisma.sourceAccount.findMany({ select: { id: true, credentials: true } }),
      (id, credentials) => prisma.sourceAccount.update({ where: { id }, data: { credentials: credentials as never } }),
      totals.SourceAccount
    );

    await migrateCredentials(
      await prisma.targetAccount.findMany({ select: { id: true, credentials: true } }),
      (id, credentials) => prisma.targetAccount.update({ where: { id }, data: { credentials: credentials as never } }),
      totals.TargetAccount
    );

    // AiConfig: field nhạy cảm nằm trong `config` (apiKey...).
    await migrateCredentials(
      (await prisma.aiConfig.findMany({ select: { id: true, config: true } })).map((r) => ({ id: r.id, credentials: r.config })),
      (id, config) => prisma.aiConfig.update({ where: { id }, data: { config: config as never } }),
      totals.AiConfig
    );

    // PlatformSession.data: mã hoá cả object.
    const sessions = await prisma.platformSession.findMany({ select: { id: true, data: true } });
    for (const session of sessions) {
      totals.PlatformSession.scanned += 1;
      const data = session.data as Record<string, unknown> | null;
      const alreadyEncrypted = data && typeof data._enc === "string" && isEncrypted(data._enc);
      if (alreadyEncrypted || data == null) continue;
      await prisma.platformSession.update({ where: { id: session.id }, data: { data: writeSessionData(data) as never } });
      totals.PlatformSession.encrypted += 1;
    }

    console.log("✔ Migration mã hoá hoàn tất:");
    for (const [model, counter] of Object.entries(totals)) {
      console.log(`  ${model}: ${counter.encrypted}/${counter.scanned} record được mã hoá.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("✖ Migration thất bại:", error);
  process.exit(1);
});
