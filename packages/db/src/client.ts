import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { ensureDesktopRuntime } from "@zerun/shared";
import { cryptoExtension } from "./crypto-extension.js";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  sqliteReady?: Promise<void>;
};

export const desktopRuntime = ensureDesktopRuntime();

// Extension mã hoá trong suốt credentials/session; cast về PrismaClient để giữ
// nguyên kiểu cho toàn bộ codebase (extension chỉ thêm hook query, không đổi API).
export const prisma =
  globalForPrisma.prisma ??
  (new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  }).$extends(cryptoExtension) as unknown as PrismaClient);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function ensureDatabaseReady() {
  globalForPrisma.sqliteReady ??= initializeSqliteDatabase().then(applySqliteMigrations);
  await globalForPrisma.sqliteReady;
}

async function initializeSqliteDatabase() {
  if (!process.env.DATABASE_URL?.startsWith("file:")) return;

  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  const hasSystemSettingTable = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'SystemSetting'"
  );

  if (hasSystemSettingTable.length === 0) {
    await resetPartialSqliteSchema();
    await applySqliteInitSql();
  }

  await ensureDefaultRows();
}

async function applySqliteInitSql() {
  for (const statement of readSqliteInitStatements()) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function resetPartialSqliteSchema() {
  const tables = readSqliteInitStatements()
    .map((statement) => /^CREATE TABLE "([^"]+)"/.exec(statement)?.[1])
    .filter((name): name is string => Boolean(name));

  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  for (const table of tables.reverse()) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}"`);
  }
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
}

function readSqliteInitStatements() {
  const sqlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../prisma/sqlite-init.sql");
  if (!existsSync(sqlPath)) {
    throw new Error(`Không tìm thấy file khởi tạo SQLite: ${sqlPath}`);
  }

  return readFileSync(sqlPath, "utf8")
    .replace(/^\s*--.*$/gm, "")
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function applySqliteMigrations() {
  if (!process.env.DATABASE_URL?.startsWith("file:")) return;
  const addIfMissing = async (table: string, column: string, definition: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`);
    if (!rows.some((r) => r.name === column)) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
    }
  };
  await addIfMissing("Content", "contentHash", "TEXT");
  await addIfMissing("Content", "duplicateOfId", "TEXT");
  await addIfMissing("TargetAccount", "linkedSourceAccountId", "TEXT");
  await addIfMissing("Content", "sourceChannelId", "TEXT");
  await addIfMissing("PublishAttempt", "targetChannelId", "TEXT");

  const channelFlowStatements = [
    `CREATE TABLE IF NOT EXISTS "PlatformChannel" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "accountKind" TEXT NOT NULL,
      "accountId" TEXT NOT NULL,
      "platform" TEXT NOT NULL,
      "externalId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "channelType" TEXT NOT NULL DEFAULT 'group',
      "isSource" BOOLEAN NOT NULL DEFAULT false,
      "isTarget" BOOLEAN NOT NULL DEFAULT false,
      "filterMode" TEXT NOT NULL DEFAULT 'all',
      "acceptedCategories" JSONB NOT NULL DEFAULT '[]',
      "allowGeneralContent" BOOLEAN NOT NULL DEFAULT true,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "metadata" JSONB NOT NULL DEFAULT '{}',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "RepostFlow" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "useAI" BOOLEAN NOT NULL DEFAULT true,
      "autoPublish" BOOLEAN NOT NULL DEFAULT false,
      "requireReview" BOOLEAN NOT NULL DEFAULT true,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "RepostFlowSource" (
      "flowId" TEXT NOT NULL,
      "channelId" TEXT NOT NULL,
      PRIMARY KEY ("flowId", "channelId"),
      FOREIGN KEY ("flowId") REFERENCES "RepostFlow" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY ("channelId") REFERENCES "PlatformChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "RepostFlowTarget" (
      "flowId" TEXT NOT NULL,
      "channelId" TEXT NOT NULL,
      PRIMARY KEY ("flowId", "channelId"),
      FOREIGN KEY ("flowId") REFERENCES "RepostFlow" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      FOREIGN KEY ("channelId") REFERENCES "PlatformChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PlatformChannel_accountKind_accountId_externalId_key" ON "PlatformChannel"("accountKind", "accountId", "externalId")`,
    `CREATE INDEX IF NOT EXISTS "PlatformChannel_accountKind_accountId_idx" ON "PlatformChannel"("accountKind", "accountId")`,
    `CREATE INDEX IF NOT EXISTS "PlatformChannel_isSource_isActive_idx" ON "PlatformChannel"("isSource", "isActive")`,
    `CREATE INDEX IF NOT EXISTS "PlatformChannel_isTarget_isActive_idx" ON "PlatformChannel"("isTarget", "isActive")`,
    `CREATE INDEX IF NOT EXISTS "RepostFlow_isActive_idx" ON "RepostFlow"("isActive")`,
    `CREATE INDEX IF NOT EXISTS "RepostFlowSource_channelId_idx" ON "RepostFlowSource"("channelId")`,
    `CREATE INDEX IF NOT EXISTS "RepostFlowTarget_channelId_idx" ON "RepostFlowTarget"("channelId")`,
    `CREATE INDEX IF NOT EXISTS "TargetAccount_linkedSourceAccountId_idx" ON "TargetAccount"("linkedSourceAccountId")`,
    `CREATE INDEX IF NOT EXISTS "Content_sourceChannelId_idx" ON "Content"("sourceChannelId")`,
    `CREATE INDEX IF NOT EXISTS "PublishAttempt_targetChannelId_idx" ON "PublishAttempt"("targetChannelId")`
  ];
  for (const statement of channelFlowStatements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function ensureDefaultRows() {
  const passwordHash = await hash(process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!", 12);
  await prisma.adminUser.upsert({
    where: { username: process.env.SEED_ADMIN_USERNAME ?? "admin" },
    update: {
      isActive: true
    },
    create: {
      username: process.env.SEED_ADMIN_USERNAME ?? "admin",
      passwordHash,
      displayName: "Quản trị Zerun",
      role: "admin"
    }
  });

  await prisma.systemSetting.upsert({
    where: { key: "installationId" },
    update: {},
    create: {
      key: "installationId",
      value: {
        appId: desktopRuntime.appId,
        appDataDir: desktopRuntime.appDataDir,
        createdBy: "desktop-runtime"
      }
    }
  });
}
