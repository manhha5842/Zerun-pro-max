import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@zerun/db";

const DEFAULT_STORAGE_DIR = process.env.SESSION_STORAGE_DIR ?? "storage/sessions";

export type ProfileRef = {
  platform: string;
  accountKind: "source" | "target";
  accountId: string;
};

/** Đường dẫn thư mục Playwright userDataDir cho 1 account. */
export function profileDir(ref: ProfileRef, storageRoot = DEFAULT_STORAGE_DIR): string {
  return join(storageRoot, ref.platform, ref.accountKind, ref.accountId);
}

/** Tạo thư mục profile nếu chưa có. */
export function ensureProfileDir(ref: ProfileRef, storageRoot = DEFAULT_STORAGE_DIR): string {
  const dir = profileDir(ref, storageRoot);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Xóa thư mục profile (khi delete session). */
export function removeProfileDir(ref: ProfileRef, storageRoot = DEFAULT_STORAGE_DIR): void {
  const dir = profileDir(ref, storageRoot);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

export type SessionStatus =
  | "unknown"
  | "created"
  | "open_for_login"
  | "login_ok"
  | "login_failed"
  | "headless_running"
  | "stopped"
  | "deleted";

/** Upsert PlatformSession record. */
export async function upsertSession(
  prisma: PrismaClient,
  ref: ProfileRef,
  data: { status: SessionStatus; sessionData?: Record<string, unknown>; expiresAt?: Date | null }
) {
  return prisma.platformSession.upsert({
    where: { platform_accountKind_accountId: { platform: ref.platform, accountKind: ref.accountKind, accountId: ref.accountId } },
    create: {
      platform: ref.platform,
      accountKind: ref.accountKind,
      accountId: ref.accountId,
      status: data.status,
      data: (data.sessionData ?? {}) as never,
      expiresAt: data.expiresAt
    },
    update: {
      status: data.status,
      ...(data.sessionData !== undefined && { data: data.sessionData as never }),
      ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt })
    }
  });
}

/** Đọc PlatformSession hiện tại. */
export async function getSession(prisma: PrismaClient, ref: ProfileRef) {
  return prisma.platformSession.findUnique({
    where: { platform_accountKind_accountId: { platform: ref.platform, accountKind: ref.accountKind, accountId: ref.accountId } }
  });
}
