import type { BrowserContext } from "playwright";
import type { PrismaClient } from "@zerun/db";
import {
  ensureProfileDir,
  getSession,
  removeProfileDir,
  upsertSession,
  type ProfileRef,
  type SessionStatus
} from "./profile-store.js";
import { launchProfile, testLoginPage, type BrowserChannel, type LaunchMode } from "./playwright-profile.js";

export type SessionManagerOptions = {
  storageRoot?: string;
  channel?: BrowserChannel;
  /** Map platform → {loginCheckUrl, isLoggedInSelector} để testLogin. */
  loginChecks?: Record<string, { url: string; selector: string }>;
};

type ActiveContext = {
  context: BrowserContext;
  mode: LaunchMode;
};

/**
 * Facade 6 thao tác vòng đời session cho Playwright-based platforms.
 * Mỗi account chỉ có 1 BrowserContext active tại 1 thời điểm.
 *
 * 6 thao tác: create → openForLogin → testLogin → runHeadless → stop → delete
 */
export class SessionManager {
  private readonly active = new Map<string, ActiveContext>();
  private readonly opts: Required<Omit<SessionManagerOptions, "loginChecks">> & { loginChecks: Record<string, { url: string; selector: string }> };

  constructor(
    private readonly prisma: PrismaClient,
    options: SessionManagerOptions = {}
  ) {
    this.opts = {
      storageRoot: options.storageRoot ?? (process.env.SESSION_STORAGE_DIR ?? "storage/sessions"),
      channel: options.channel ?? "chrome",
      loginChecks: options.loginChecks ?? {}
    };
  }

  /** 1. Tạo record session + thư mục profile (không mở browser). */
  async create(ref: ProfileRef): Promise<void> {
    ensureProfileDir(ref, this.opts.storageRoot);
    await upsertSession(this.prisma, ref, { status: "created" });
  }

  /** 2. Mở browser headful để user đăng nhập thủ công. */
  async openForLogin(ref: ProfileRef): Promise<BrowserContext> {
    await this.stopIfActive(ref);
    const context = await launchProfile(ref, {
      mode: "headful",
      channel: this.opts.channel,
      storageRoot: this.opts.storageRoot
    });
    this.active.set(contextKey(ref), { context, mode: "headful" });
    await upsertSession(this.prisma, ref, { status: "open_for_login" });
    return context;
  }

  /** 3. Kiểm tra đăng nhập (dùng context đang mở hoặc mở headless tạm). */
  async testLogin(ref: ProfileRef): Promise<boolean> {
    const check = this.opts.loginChecks[ref.platform];
    if (!check) {
      await upsertSession(this.prisma, ref, { status: "login_ok" });
      return true;
    }

    let context: BrowserContext;
    let shouldClose = false;

    const existing = this.active.get(contextKey(ref));
    if (existing) {
      context = existing.context;
    } else {
      context = await launchProfile(ref, { mode: "headless", channel: this.opts.channel, storageRoot: this.opts.storageRoot });
      shouldClose = true;
    }

    try {
      const ok = await testLoginPage(context, check.url, check.selector);
      const status: SessionStatus = ok ? "login_ok" : "login_failed";
      await upsertSession(this.prisma, ref, { status });
      return ok;
    } finally {
      if (shouldClose) await context.close().catch(() => undefined);
    }
  }

  /** 4. Chạy browser headless (automation). Đóng bất kỳ context headful nào trước. */
  async runHeadless(ref: ProfileRef): Promise<BrowserContext> {
    await this.stopIfActive(ref);
    const context = await launchProfile(ref, {
      mode: "headless",
      channel: this.opts.channel,
      storageRoot: this.opts.storageRoot
    });
    this.active.set(contextKey(ref), { context, mode: "headless" });
    await upsertSession(this.prisma, ref, { status: "headless_running" });
    return context;
  }

  /** 5. Dừng browser context đang chạy. */
  async stop(ref: ProfileRef): Promise<void> {
    await this.stopIfActive(ref);
    await upsertSession(this.prisma, ref, { status: "stopped" });
  }

  /** 6. Xóa hẳn: đóng browser + xóa profile dir + cập nhật DB. */
  async delete(ref: ProfileRef): Promise<void> {
    await this.stopIfActive(ref);
    removeProfileDir(ref, this.opts.storageRoot);
    await upsertSession(this.prisma, ref, { status: "deleted" });
  }

  /** Lấy context đang active của account (nếu có). */
  getActive(ref: ProfileRef): BrowserContext | undefined {
    return this.active.get(contextKey(ref))?.context;
  }

  /** Lấy status từ DB. */
  async getStatus(ref: ProfileRef): Promise<SessionStatus> {
    const session = await getSession(this.prisma, ref);
    return (session?.status as SessionStatus) ?? "unknown";
  }

  private async stopIfActive(ref: ProfileRef): Promise<void> {
    const key = contextKey(ref);
    const existing = this.active.get(key);
    if (!existing) return;
    this.active.delete(key);
    await existing.context.close().catch(() => undefined);
  }
}

function contextKey(ref: ProfileRef): string {
  return `${ref.platform}:${ref.accountKind}:${ref.accountId}`;
}
