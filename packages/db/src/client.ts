import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { ensureDesktopRuntime } from "@zerun/shared";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  sqliteReady?: Promise<void>;
};

export const desktopRuntime = ensureDesktopRuntime();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export async function ensureDatabaseReady() {
  globalForPrisma.sqliteReady ??= initializeSqliteDatabase();
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
