import path from "node:path";
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "playwright";
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma as defaultPrisma, type PrismaClient } from "@zerun/db";
import { fail, logger, ok } from "@zerun/shared";

type SessionStatus =
  | "not_started"
  | "starting"
  | "ready"
  | "busy"
  | "waiting_captcha"
  | "login_required"
  | "error"
  | "stopped";

type BrowserConvertJobStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "waiting_captcha"
  | "login_required"
  | "manual_required"
  | "cancelled";

type BrowserConvertErrorCode =
  | "SESSION_NOT_READY"
  | "LOGIN_REQUIRED"
  | "CAPTCHA_REQUIRED"
  | "CONVERTER_PAGE_TIMEOUT"
  | "SELECTOR_NOT_FOUND"
  | "CONVERSION_OUTPUT_NOT_FOUND"
  | "INVALID_INPUT_URL"
  | "BROWSER_CRASHED"
  | "UNKNOWN_ERROR";

type BrowserConvertInput = {
  platform: "shopee";
  url: string;
  subIds: string[];
  subId?: string;
  outputType: "shortlink" | "full";
  accountId: string;
  mode: "browser_ui_convert";
  source: "convert_link_tool" | "message_pipeline" | "manual_test" | "api" | string;
  sourceContentId?: string;
};

type QueueStatus = {
  runningJobId: string | null;
  queuedJobIds: string[];
  queuedCount: number;
  paused: boolean;
};

type BrowserSessionPayload = {
  browserName: typeof SHOPEE_BROWSER_NAME;
  accountId: typeof SHOPEE_ACCOUNT_ID;
  status: SessionStatus;
  currentUrl: string | null;
  lastHealthCheckAt: string | null;
  lastError: string | null;
  lastScreenshotPath: string | null;
  queueStatus: QueueStatus;
  profilePath: string;
  browserPid: number | null;
  pageName: typeof SHOPEE_CONVERTER_PAGE_NAME;
  captchaLoginState: "waiting_captcha" | "login_required" | null;
};

const SHOPEE_ACCOUNT_ID = "shopee-main";
const SHOPEE_BROWSER_NAME = "Zerun Controlled Browser - Shopee Main";
const ZERUN_ADMIN_BROWSER_NAME = "Zerun Admin Browser";
const SHOPEE_CONVERTER_PAGE_NAME = "Shopee Affiliate Converter Page";
const SHOPEE_PLATFORM = "shopee";
const SHOPEE_ACCOUNT_KIND = "affiliate";
const BROWSER_ACTION = "browser_ui_convert";
const MANUAL_BROWSER_CONVERT_PLATFORM = "manual_browser_convert";
const DIRECT_CONVERT_SOURCE_REF = "convert-link-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
const profilePath = path.resolve(process.env.SHOPEE_BROWSER_USER_DATA_DIR ?? path.join(projectRoot, "runtime/browser-profiles/shopee-main"));
const screenshotDir = path.resolve(process.env.SHOPEE_BROWSER_SCREENSHOT_DIR ?? path.join(projectRoot, "runtime/browser-screenshots/shopee-main"));
const converterUrl = process.env.SHOPEE_AFFILIATE_CONVERTER_URL ?? "https://affiliate.shopee.vn/offer/custom_link";
const conversionTimeoutMs = Math.max(10_000, Number(process.env.SHOPEE_CONVERTER_TIMEOUT_MS ?? 60_000));

const terminalJobStatuses = new Set<BrowserConvertJobStatus>(["success", "failed", "cancelled", "manual_required"]);
const blockedSessionStatuses = new Set<SessionStatus>(["waiting_captcha", "login_required"]);

class BrowserConversionError extends Error {
  constructor(
    readonly code: BrowserConvertErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly jobStatus: BrowserConvertJobStatus,
    readonly screenshotPath?: string
  ) {
    super(message);
  }
}

function assertShopeeAccount(accountId: string) {
  if (accountId !== SHOPEE_ACCOUNT_ID) {
    throw new BrowserConversionError("SESSION_NOT_READY", `Giai đoạn 1 chỉ hỗ trợ accountId=${SHOPEE_ACCOUNT_ID}.`, false, "failed");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function readBooleanEnv(value: unknown, fallback: boolean) {
  if (typeof value !== "string") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

type ShopeeBrowserChannel = "chrome" | "msedge" | "chromium";

function readShopeeBrowserChannel(): ShopeeBrowserChannel {
  const value = String(process.env.SHOPEE_BROWSER_CHANNEL ?? "chrome").trim().toLowerCase();
  if (value === "msedge" || value === "chromium") return value;
  return "chrome";
}

function readOptionalDirectoryEnv(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const resolved = path.resolve(value.trim());
  return existsSync(resolved) ? resolved : null;
}

function buildShopeeBrowserArgs(input: { stealth: boolean; extensionDir: string | null }) {
  const args = ["--lang=vi-VN"];
  if (readBooleanEnv(process.env.SHOPEE_BROWSER_NO_SANDBOX, false)) {
    args.push("--no-sandbox", "--disable-setuid-sandbox");
  }
  if (input.stealth) {
    args.push("--disable-blink-features=AutomationControlled");
  }
  if (input.extensionDir) {
    args.push(`--disable-extensions-except=${input.extensionDir}`, `--load-extension=${input.extensionDir}`);
  }
  return args;
}

function nowIso() {
  return new Date().toISOString();
}

function padSubIds(subIds: string[]) {
  return Array.from({ length: 5 }, (_, index) => subIds[index] ?? "");
}

function sanitizeSubIdSegment(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 64);
}

function buildFinalSubId(input: { subId?: string; subIds: string[] }) {
  if (input.subId?.trim()) return sanitizeSubIdSegment(input.subId);
  const segments = input.subIds.map(sanitizeSubIdSegment).filter(Boolean);
  return segments.join("-");
}

function isShopeeUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host === "shopee.vn"
      || host.endsWith(".shopee.vn")
      || host === "shopee.ee"
      || host === "s.shopee.vn"
      || host.includes("shopee.");
  } catch {
    return false;
  }
}

function sanitizeScreenshotReason(reason: string) {
  return reason.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "capture";
}

function screenshotPublicPath(filename: string) {
  return `/browser-sessions/${SHOPEE_ACCOUNT_ID}/screenshots/${filename}`;
}

function normalizeUrlCandidate(value: string) {
  return value.trim().replace(/[),.;!?\]\s"'<>]+$/g, "");
}

function isShortShopeeLink(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "s.shopee.vn" || host === "shopee.ee";
  } catch {
    return false;
  }
}

function isFullShopeeAffiliateLink(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return host.includes("shopee.")
      && !isShortShopeeLink(value)
      && (
        url.searchParams.has("affiliate_id")
        || url.searchParams.get("utm_medium") === "affiliates"
        || (url.searchParams.get("utm_source") ?? "").startsWith("an_")
        || url.searchParams.has("af_siteid")
      );
  } catch {
    return false;
  }
}

function pickConvertedUrl(candidates: string[], originalUrl: string, outputType: "shortlink" | "full") {
  const unique = Array.from(new Set(candidates.map(normalizeUrlCandidate).filter(Boolean)));
  const converted = unique.filter((candidate) => {
    if (candidate === originalUrl) return false;
    return isShortShopeeLink(candidate) || isFullShopeeAffiliateLink(candidate);
  });
  if (outputType === "full") {
    return converted.find(isFullShopeeAffiliateLink) ?? converted[0] ?? null;
  }
  return converted.find(isShortShopeeLink) ?? converted[0] ?? null;
}

function extractRunMetadata(value: unknown) {
  return asRecord(value);
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

class ShopeeSessionManager {
  constructor(private readonly prisma: PrismaClient) {}

  async updateStatus(accountId: string, status: SessionStatus, metadata: Record<string, unknown> = {}) {
    assertShopeeAccount(accountId);
    const current = await this.prisma.platformSession.findUnique({
      where: {
        platform_accountKind_accountId: {
          platform: SHOPEE_PLATFORM,
          accountKind: SHOPEE_ACCOUNT_KIND,
          accountId
        }
      }
    });
    const currentData = asRecord(current?.data);
    const nextData = {
      ...currentData,
      browserName: SHOPEE_BROWSER_NAME,
      adminBrowserName: ZERUN_ADMIN_BROWSER_NAME,
      pageName: SHOPEE_CONVERTER_PAGE_NAME,
      profilePath,
      userDataDir: profilePath,
      ...metadata
    };

    return this.prisma.platformSession.upsert({
      where: {
        platform_accountKind_accountId: {
          platform: SHOPEE_PLATFORM,
          accountKind: SHOPEE_ACCOUNT_KIND,
          accountId
        }
      },
      create: {
        platform: SHOPEE_PLATFORM,
        accountKind: SHOPEE_ACCOUNT_KIND,
        accountId,
        status,
        cookiePath: profilePath,
        data: asJson(nextData)
      },
      update: {
        status,
        cookiePath: profilePath,
        data: asJson(nextData)
      }
    });
  }

  async getSession(accountId: string) {
    assertShopeeAccount(accountId);
    return this.prisma.platformSession.findUnique({
      where: {
        platform_accountKind_accountId: {
          platform: SHOPEE_PLATFORM,
          accountKind: SHOPEE_ACCOUNT_KIND,
          accountId
        }
      }
    });
  }

  async getStatus(accountId: string): Promise<SessionStatus> {
    const session = await this.getSession(accountId);
    return (session?.status as SessionStatus | undefined) ?? "not_started";
  }

  async buildPayload(accountId: string, queueStatus: QueueStatus): Promise<BrowserSessionPayload> {
    const session = await this.getSession(accountId);
    const data = asRecord(session?.data);
    const status = (session?.status as SessionStatus | undefined) ?? "not_started";
    return {
      browserName: SHOPEE_BROWSER_NAME,
      accountId: SHOPEE_ACCOUNT_ID,
      status,
      currentUrl: typeof data.currentUrl === "string" ? data.currentUrl : null,
      lastHealthCheckAt: typeof data.lastHealthCheckAt === "string" ? data.lastHealthCheckAt : null,
      lastError: typeof data.lastError === "string" ? data.lastError : null,
      lastScreenshotPath: typeof data.lastScreenshotPath === "string" ? data.lastScreenshotPath : null,
      queueStatus,
      profilePath,
      browserPid: typeof data.browserPid === "number" ? data.browserPid : null,
      pageName: SHOPEE_CONVERTER_PAGE_NAME,
      captchaLoginState: status === "waiting_captcha" || status === "login_required" ? status : null
    };
  }
}

type ActiveShopeeSession = {
  context?: BrowserContext;
  converterPage?: Page;
  starting?: Promise<void>;
};

class ShopeeBrowserManager {
  private readonly activeSessions = new Map<string, ActiveShopeeSession>();

  constructor(private readonly sessionManager: ShopeeSessionManager) {}

  async startSession(accountId = SHOPEE_ACCOUNT_ID) {
    assertShopeeAccount(accountId);
    const state = this.getState(accountId);
    if (state.context && this.isContextAlive(state.context)) {
      await this.updateCurrentUrl(accountId, state);
      return this.sessionManager.getStatus(accountId);
    }
    if (state.starting) {
      await state.starting;
      return this.sessionManager.getStatus(accountId);
    }

    state.starting = this.launchContext(accountId, state).finally(() => {
      state.starting = undefined;
    });
    await state.starting;
    return this.sessionManager.getStatus(accountId);
  }

  async stopSession(accountId = SHOPEE_ACCOUNT_ID) {
    assertShopeeAccount(accountId);
    const state = this.getState(accountId);
    await state.context?.close().catch(() => undefined);
    state.context = undefined;
    state.converterPage = undefined;
    await this.sessionManager.updateStatus(accountId, "stopped", {
      currentUrl: null,
      lastError: null,
      lastHealthCheckAt: nowIso()
    });
    return this.sessionManager.getStatus(accountId);
  }

  async restartSession(accountId = SHOPEE_ACCOUNT_ID) {
    await this.stopSession(accountId);
    return this.startSession(accountId);
  }

  async getSessionStatus(accountId = SHOPEE_ACCOUNT_ID) {
    assertShopeeAccount(accountId);
    const state = this.getState(accountId);
    if (state.context && !this.isContextAlive(state.context)) {
      state.context = undefined;
      state.converterPage = undefined;
      await this.sessionManager.updateStatus(accountId, "stopped", {
        currentUrl: null,
        lastHealthCheckAt: nowIso()
      });
    } else if (state.context) {
      await this.updateCurrentUrl(accountId, state);
    }
    return this.sessionManager.getStatus(accountId);
  }

  async openConverterPage(accountId = SHOPEE_ACCOUNT_ID) {
    assertShopeeAccount(accountId);
    await this.startSession(accountId);
    const state = this.getState(accountId);
    if (!state.context || !this.isContextAlive(state.context)) {
      throw new BrowserConversionError("BROWSER_CRASHED", `${SHOPEE_BROWSER_NAME} chưa sẵn sàng.`, true, "failed");
    }

    if (!state.converterPage || state.converterPage.isClosed()) {
      state.converterPage = await state.context.newPage();
      state.converterPage.setDefaultTimeout(15_000);
    }
    await state.converterPage.bringToFront().catch(() => undefined);
    await this.sessionManager.updateStatus(accountId, "ready", {
      currentUrl: state.converterPage.url(),
      pageName: SHOPEE_CONVERTER_PAGE_NAME,
      lastHealthCheckAt: nowIso(),
      lastError: null
    });
    return state.converterPage;
  }

  async navigateConverterPage(accountId = SHOPEE_ACCOUNT_ID) {
    const page = await this.openConverterPage(accountId);
    await page.goto(converterUrl, { waitUntil: "domcontentloaded", timeout: conversionTimeoutMs });
    await this.sessionManager.updateStatus(accountId, "ready", {
      currentUrl: page.url(),
      lastHealthCheckAt: nowIso(),
      lastError: null
    });
    return page;
  }

  async captureScreenshot(accountId = SHOPEE_ACCOUNT_ID, reason = "capture") {
    assertShopeeAccount(accountId);
    const state = this.getState(accountId);
    const page = state.converterPage && !state.converterPage.isClosed()
      ? state.converterPage
      : state.context?.pages().find((item) => !item.isClosed());
    if (!page) return null;

    mkdirSync(screenshotDir, { recursive: true });
    const filename = `${SHOPEE_ACCOUNT_ID}-${sanitizeScreenshotReason(reason)}-${Date.now()}.png`;
    const fullPath = path.join(screenshotDir, filename);
    await page.screenshot({ path: fullPath, fullPage: true }).catch(() => undefined);
    const publicPath = screenshotPublicPath(filename);
    await this.sessionManager.updateStatus(accountId, await this.sessionManager.getStatus(accountId), {
      lastScreenshotPath: publicPath,
      lastScreenshotFilePath: fullPath,
      currentUrl: page.url(),
      lastHealthCheckAt: nowIso()
    });
    return publicPath;
  }

  async isCaptchaOrLoginRequired(page: Page) {
    const currentUrl = page.url().toLowerCase();
    if (/passport|login|signin|account\/signin|buyer\/login/.test(currentUrl)) {
      return { status: "login_required" as const, reason: "Shopee login page" };
    }
    if (/captcha|verify|verification|security|anti[-_]?bot|risk/.test(currentUrl)) {
      return { status: "waiting_captcha" as const, reason: "Shopee security verification page" };
    }

    const bodyText = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
    const normalized = bodyText.toLowerCase();
    if (/đăng nhập|dang nhap|login|sign in|session expired|unauthorized|hết phiên|het phien/.test(normalized)) {
      return { status: "login_required" as const, reason: "Affiliate login expired" };
    }
    if (/captcha|xác minh|xac minh|verification|security check|kiểm tra bảo mật|kiem tra bao mat|robot|unusual activity/.test(normalized)) {
      return { status: "waiting_captcha" as const, reason: "Captcha hoặc kiểm tra bảo mật" };
    }
    return null;
  }

  async healthCheck(accountId = SHOPEE_ACCOUNT_ID) {
    assertShopeeAccount(accountId);
    try {
      const page = await this.openConverterPage(accountId);
      const detected = await this.isCaptchaOrLoginRequired(page);
      if (detected) {
        await this.sessionManager.updateStatus(accountId, detected.status, {
          currentUrl: page.url(),
          lastError: detected.reason,
          lastHealthCheckAt: nowIso()
        });
        return detected.status;
      }
      await this.sessionManager.updateStatus(accountId, "ready", {
        currentUrl: page.url(),
        lastError: null,
        lastHealthCheckAt: nowIso()
      });
      return "ready" as SessionStatus;
    } catch (error) {
      const message = readErrorMessage(error);
      await this.sessionManager.updateStatus(accountId, "error", {
        lastError: message,
        lastHealthCheckAt: nowIso()
      });
      return "error" as SessionStatus;
    }
  }

  async markCaptchaResolved(accountId = SHOPEE_ACCOUNT_ID) {
    assertShopeeAccount(accountId);
    await this.startSession(accountId);
    return this.healthCheck(accountId);
  }

  async shutdown() {
    await Promise.allSettled(Array.from(this.activeSessions.keys()).map((accountId) => this.stopSession(accountId)));
  }

  private getState(accountId: string) {
    let state = this.activeSessions.get(accountId);
    if (!state) {
      state = {};
      this.activeSessions.set(accountId, state);
    }
    return state;
  }

  private isContextAlive(context: BrowserContext) {
    try {
      context.pages();
      return true;
    } catch {
      return false;
    }
  }

  private async launchContext(accountId: string, state: ActiveShopeeSession) {
    mkdirSync(profilePath, { recursive: true });
    await this.sessionManager.updateStatus(accountId, "starting", {
      currentUrl: null,
      lastError: null,
      lastHealthCheckAt: nowIso()
    });

    try {
      const { chromium } = await import("playwright");
      const headless = readBooleanEnv(process.env.SHOPEE_BROWSER_HEADLESS ?? process.env.HEADLESS, false);
      const requestedChannel = readShopeeBrowserChannel();
      const stealth = readBooleanEnv(process.env.SHOPEE_BROWSER_STEALTH, false);
      const extensionDir = readOptionalDirectoryEnv(process.env.SHOPEE_BROWSER_EXTENSION_DIR);
      if (process.env.SHOPEE_BROWSER_EXTENSION_DIR && !extensionDir) {
        logger.warn("SHOPEE_BROWSER_EXTENSION_DIR was ignored because the directory does not exist.", {
          extensionDir: process.env.SHOPEE_BROWSER_EXTENSION_DIR
        });
      }

      const createLaunchOptions = (channel: ShopeeBrowserChannel) => ({
        headless,
        ...(channel === "chromium" ? {} : { channel }),
        args: buildShopeeBrowserArgs({ stealth, extensionDir }),
        ...(stealth ? { ignoreDefaultArgs: ["--enable-automation"] } : {}),
        viewport: headless ? { width: 1366, height: 900 } : null,
        locale: "vi-VN",
        timezoneId: "Asia/Saigon"
      });

      let browserChannel = requestedChannel;
      let context: BrowserContext;
      try {
        context = await chromium.launchPersistentContext(profilePath, createLaunchOptions(requestedChannel));
      } catch (error) {
        if (requestedChannel === "chromium") throw error;
        logger.warn("Requested Shopee browser channel failed; falling back to Playwright Chromium.", {
          browserName: SHOPEE_BROWSER_NAME,
          requestedChannel,
          error: readErrorMessage(error)
        });
        browserChannel = "chromium";
        context = await chromium.launchPersistentContext(profilePath, createLaunchOptions(browserChannel));
      }

      state.context = context;
      state.converterPage = context.pages().find((page) => !page.isClosed());
      context.on("close", () => {
        const current = this.getState(accountId);
        current.context = undefined;
        current.converterPage = undefined;
        void this.sessionManager.updateStatus(accountId, "stopped", {
          currentUrl: null,
          lastHealthCheckAt: nowIso()
        });
      });
      await this.sessionManager.updateStatus(accountId, "ready", {
        currentUrl: state.converterPage?.url() ?? null,
        browserPid: null,
        browserChannel,
        browserStealth: stealth,
        extensionDir,
        lastError: null,
        lastHealthCheckAt: nowIso()
      });
      logger.info("BROWSER_STARTED", {
        browserName: SHOPEE_BROWSER_NAME,
        accountId,
        profilePath,
        headless,
        browserChannel,
        browserStealth: stealth,
        extensionDir
      });
    } catch (error) {
      const message = readErrorMessage(error);
      await this.sessionManager.updateStatus(accountId, "error", {
        lastError: message,
        lastHealthCheckAt: nowIso()
      });
      throw new BrowserConversionError("BROWSER_CRASHED", message, true, "failed");
    }
  }

  private async updateCurrentUrl(accountId: string, state: ActiveShopeeSession) {
    const page = state.converterPage && !state.converterPage.isClosed()
      ? state.converterPage
      : state.context?.pages().find((item) => !item.isClosed());
    await this.sessionManager.updateStatus(accountId, await this.sessionManager.getStatus(accountId), {
      currentUrl: page?.url() ?? null,
      lastHealthCheckAt: nowIso()
    });
  }
}

class TelegramAdminNotifier {
  constructor(private readonly prisma: PrismaClient) {}

  async sendCaptchaLoginAlert(input: {
    jobId: string;
    status: "waiting_captcha" | "login_required";
    currentUrl: string;
    originalUrl: string;
    screenshotPath?: string | null;
  }) {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: "telegram_notify" } }).catch(() => null);
    const tg = asRecord(setting?.value);
    if (!tg.enabled || !tg.botToken || !tg.chatId) return { sent: false, reason: "disabled" as const };

    const screenshotLine = input.screenshotPath ? `\nScreenshot: ${input.screenshotPath}` : "";
    const text = `⚠️ Zerun Shopee cần admin xử lý

Browser: ${SHOPEE_BROWSER_NAME}
Account: ${SHOPEE_ACCOUNT_ID}
Page: ${SHOPEE_CONVERTER_PAGE_NAME}
Job: ${input.jobId}
Action: ${BROWSER_ACTION}
Status: ${input.status}
URL hiện tại: ${input.currentUrl}
Link đang convert: ${input.originalUrl}${screenshotLine}

Vào Zerun Admin → Convert link affiliate hoặc Browser Sessions → Shopee Main để xử lý.
Sau khi giải xong, bấm Mark Resolved hoặc Retry Job.`;

    const response = await fetch(`https://api.telegram.org/bot${String(tg.botToken)}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: String(tg.chatId),
        text,
        disable_web_page_preview: true
      })
    }).catch(() => null);

    return { sent: Boolean(response?.ok), reason: response?.ok ? undefined : "send_failed" as const };
  }
}

class BrowserConvertStore {
  constructor(private readonly prisma: PrismaClient) {}

  async createJob(input: BrowserConvertInput) {
    const finalSubId = buildFinalSubId({ subId: input.subId, subIds: input.subIds });
    const rule = await this.ensureDirectConvertRule();
    const sourceExternalId = `browser-convert-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const metadata = {
      platform: input.platform,
      accountId: input.accountId,
      outputType: input.outputType,
      subIds: padSubIds(input.subIds),
      finalSubId,
      browserName: SHOPEE_BROWSER_NAME,
      adminBrowserName: ZERUN_ADMIN_BROWSER_NAME,
      pageName: SHOPEE_CONVERTER_PAGE_NAME,
      action: BROWSER_ACTION,
      source: input.source,
      sourceContentId: input.sourceContentId ?? null,
      stageLogs: []
    };

    const run = await this.prisma.autoConversionRun.create({
      data: {
        ruleId: rule.id,
        sourcePlatform: MANUAL_BROWSER_CONVERT_PLATFORM,
        sourceRef: DIRECT_CONVERT_SOURCE_REF,
        sourceExternalId,
        sourceUrl: input.url,
        originalText: input.url,
        status: "queued",
        targetAccountIds: [],
        metadata: asJson(metadata),
        links: {
          create: {
            originalUrl: input.url,
            network: SHOPEE_PLATFORM,
            action: BROWSER_ACTION
          }
        }
      },
      include: { links: true }
    });

    await this.logStage(run.id, "JOB_CREATED", {
      accountId: input.accountId,
      originalUrl: input.url,
      subId: finalSubId
    });
    return run;
  }

  async getJob(jobId: string) {
    const run = await this.prisma.autoConversionRun.findUnique({
      where: { id: jobId },
      include: { links: true }
    });
    if (!run) return null;
    const metadata = extractRunMetadata(run.metadata);
    const link = run.links[0];
    return {
      jobId: run.id,
      platform: metadata.platform ?? SHOPEE_PLATFORM,
      originalUrl: link?.originalUrl ?? run.originalText,
      convertedUrl: link?.convertedUrl ?? null,
      subId: typeof metadata.finalSubId === "string" ? metadata.finalSubId : "",
      subIds: Array.isArray(metadata.subIds) ? metadata.subIds.map(String) : [],
      outputType: metadata.outputType ?? "shortlink",
      status: run.status,
      errorCode: run.errorCode ?? null,
      errorMessage: run.errorMessage ?? null,
      screenshotPath: typeof metadata.screenshotPath === "string"
        ? metadata.screenshotPath
        : typeof metadata.lastScreenshotPath === "string"
          ? metadata.lastScreenshotPath
          : null,
      retryable: typeof metadata.retryable === "boolean" ? metadata.retryable : false,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      metadata
    };
  }

  async markRunning(jobId: string) {
    const run = await this.prisma.autoConversionRun.findUnique({ where: { id: jobId }, select: { startedAt: true, metadata: true } });
    const metadata = extractRunMetadata(run?.metadata);
    await this.prisma.autoConversionRun.update({
      where: { id: jobId },
      data: {
        status: "running",
        errorCode: null,
        errorMessage: null,
        startedAt: run?.startedAt ?? new Date(),
        completedAt: null,
        metadata: asJson({ ...metadata, retryable: false })
      }
    });
  }

  async markSuccess(jobId: string, convertedUrl: string, currentUrl: string | null) {
    const run = await this.prisma.autoConversionRun.findUnique({ where: { id: jobId }, select: { metadata: true } });
    const metadata = extractRunMetadata(run?.metadata);
    await this.prisma.$transaction([
      this.prisma.autoConversionRun.update({
        where: { id: jobId },
        data: {
          status: "success",
          processedText: convertedUrl,
          errorCode: null,
          errorMessage: null,
          completedAt: new Date(),
          metadata: asJson({ ...metadata, convertedUrl, currentUrl, retryable: false })
        }
      }),
      this.prisma.autoConversionLink.updateMany({
        where: { runId: jobId },
        data: {
          convertedUrl,
          network: SHOPEE_PLATFORM,
          action: BROWSER_ACTION,
          error: null
        }
      })
    ]);
    await this.logStage(jobId, "SUCCESS", { convertedUrl, currentUrl });
  }

  async markError(jobId: string, error: BrowserConversionError, currentUrl?: string | null) {
    const run = await this.prisma.autoConversionRun.findUnique({ where: { id: jobId }, select: { metadata: true } });
    const metadata = extractRunMetadata(run?.metadata);
    const completedAt = terminalJobStatuses.has(error.jobStatus) ? new Date() : undefined;
    await this.prisma.$transaction([
      this.prisma.autoConversionRun.update({
        where: { id: jobId },
        data: {
          status: error.jobStatus,
          errorCode: error.code,
          errorMessage: error.message,
          completedAt,
          metadata: asJson({
            ...metadata,
            retryable: error.retryable,
            screenshotPath: error.screenshotPath ?? metadata.screenshotPath ?? null,
            lastScreenshotPath: error.screenshotPath ?? metadata.lastScreenshotPath ?? null,
            currentUrl: currentUrl ?? metadata.currentUrl ?? null
          })
        }
      }),
      this.prisma.autoConversionLink.updateMany({
        where: { runId: jobId },
        data: {
          network: SHOPEE_PLATFORM,
          action: BROWSER_ACTION,
          error: `${error.code}: ${error.message}`
        }
      })
    ]);
    const stage = error.jobStatus === "waiting_captcha"
      ? "CAPTCHA_DETECTED"
      : error.jobStatus === "login_required"
        ? "LOGIN_REQUIRED"
        : "FAILED";
    await this.logStage(jobId, stage, {
      errorCode: error.code,
      errorMessage: error.message,
      currentUrl,
      screenshotPath: error.screenshotPath
    });
  }

  async markQueued(jobId: string) {
    const run = await this.prisma.autoConversionRun.findUnique({ where: { id: jobId }, select: { metadata: true } });
    const metadata = extractRunMetadata(run?.metadata);
    await this.prisma.autoConversionRun.update({
      where: { id: jobId },
      data: {
        status: "queued",
        errorCode: null,
        errorMessage: null,
        completedAt: null,
        metadata: asJson({ ...metadata, retryable: false })
      }
    });
    await this.prisma.autoConversionLink.updateMany({ where: { runId: jobId }, data: { error: null } });
    await this.logStage(jobId, "JOB_CREATED", { retry: true });
  }

  async markCancelled(jobId: string) {
    const run = await this.prisma.autoConversionRun.findUnique({ where: { id: jobId }, select: { metadata: true } });
    const metadata = extractRunMetadata(run?.metadata);
    await this.prisma.$transaction([
      this.prisma.autoConversionRun.update({
        where: { id: jobId },
        data: {
          status: "cancelled",
          completedAt: new Date(),
          metadata: asJson({ ...metadata, retryable: false })
        }
      }),
      this.prisma.autoConversionLink.updateMany({
        where: { runId: jobId },
        data: { error: "Job đã bị hủy bởi admin." }
      })
    ]);
    await this.logStage(jobId, "FAILED", { cancelled: true });
  }

  async logStage(jobId: string, stage: string, details: Record<string, unknown> = {}) {
    const run = await this.prisma.autoConversionRun.findUnique({
      where: { id: jobId },
      select: { metadata: true, originalText: true }
    });
    const metadata = extractRunMetadata(run?.metadata);
    const entry = {
      stage,
      jobId,
      accountId: metadata.accountId ?? SHOPEE_ACCOUNT_ID,
      originalUrl: details.originalUrl ?? run?.originalText ?? null,
      subId: details.subId ?? metadata.finalSubId ?? null,
      currentUrl: details.currentUrl ?? metadata.currentUrl ?? null,
      screenshotPath: details.screenshotPath ?? metadata.screenshotPath ?? null,
      timestamp: nowIso(),
      ...details
    };
    const existingLogs = Array.isArray(metadata.stageLogs) ? metadata.stageLogs : [];
    const stageLogs = [...existingLogs.slice(-99), entry];
    await this.prisma.autoConversionRun.update({
      where: { id: jobId },
      data: {
        metadata: asJson({
          ...metadata,
          lastStage: stage,
          lastStageAt: entry.timestamp,
          stageLogs
        })
      }
    });
    await this.prisma.activityLog.create({
      data: {
        type: "browser_convert_stage",
        message: stage,
        platform: SHOPEE_PLATFORM,
        metadata: asJson(entry)
      }
    }).catch(() => undefined);
    logger.info(stage, entry);
  }

  async recoverQueuedJobs() {
    const runs = await this.prisma.autoConversionRun.findMany({
      where: {
        sourcePlatform: MANUAL_BROWSER_CONVERT_PLATFORM,
        status: { in: ["queued", "running"] }
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, status: true }
    });
    for (const run of runs) {
      if (run.status === "running") await this.markQueued(run.id);
    }
    return runs.map((run) => run.id);
  }

  private async ensureDirectConvertRule() {
    const existing = await this.prisma.autoConversionRule.findFirst({
      where: {
        sourcePlatform: MANUAL_BROWSER_CONVERT_PLATFORM,
        sourceRef: DIRECT_CONVERT_SOURCE_REF
      },
      orderBy: { createdAt: "asc" }
    });
    if (existing) return existing;
    return this.prisma.autoConversionRule.create({
      data: {
        name: "Browser convert trực tiếp Shopee",
        description: "Job trực tiếp từ Convert link affiliate qua Zerun Controlled Browser - Shopee Main.",
        enabled: true,
        sourcePlatform: MANUAL_BROWSER_CONVERT_PLATFORM,
        sourceRef: DIRECT_CONVERT_SOURCE_REF,
        triggerMode: "manual",
        pollingIntervalMinutes: 0,
        targetAccountIds: [],
        linkRules: { shopee: BROWSER_ACTION },
        contentRules: {},
        mediaRules: {},
        scheduleRules: {}
      }
    });
  }
}

class ShopeeLinkConverter {
  constructor(
    private readonly browserManager: ShopeeBrowserManager,
    private readonly store: BrowserConvertStore
  ) {}

  async convert(jobId: string) {
    const job = await this.store.getJob(jobId);
    if (!job) throw new BrowserConversionError("UNKNOWN_ERROR", "Không tìm thấy browser conversion job.", false, "failed");
    const accountId = String(job.metadata.accountId ?? SHOPEE_ACCOUNT_ID);
    assertShopeeAccount(accountId);
    const originalUrl = String(job.originalUrl);
    const finalSubId = String(job.subId ?? "");
    const subIds = padSubIds(Array.isArray(job.subIds) ? job.subIds.map(String) : []);
    const outputType = job.outputType === "full" ? "full" : "shortlink";

    await this.store.logStage(jobId, "SESSION_CHECK", { accountId, originalUrl, subId: finalSubId });
    const health = await this.browserManager.healthCheck(accountId);
    if (health === "waiting_captcha" || health === "login_required") {
      const screenshotPath = await this.browserManager.captureScreenshot(accountId, health);
      throw new BrowserConversionError(
        health === "login_required" ? "LOGIN_REQUIRED" : "CAPTCHA_REQUIRED",
        health === "login_required" ? "Shopee yêu cầu đăng nhập lại." : "Shopee yêu cầu admin xử lý captcha/xác minh.",
        true,
        health,
        screenshotPath ?? undefined
      );
    }
    if (health !== "ready") {
      throw new BrowserConversionError("SESSION_NOT_READY", `${SHOPEE_BROWSER_NAME} chưa sẵn sàng.`, true, "failed");
    }

    let page: Page;
    try {
      await this.store.logStage(jobId, "NAVIGATE_CONVERTER_PAGE", { accountId, originalUrl, subId: finalSubId, currentUrl: converterUrl });
      page = await this.browserManager.navigateConverterPage(accountId);
    } catch (error) {
      const screenshotPath = await this.browserManager.captureScreenshot(accountId, "converter_page_timeout");
      throw new BrowserConversionError("CONVERTER_PAGE_TIMEOUT", readErrorMessage(error), true, "failed", screenshotPath ?? undefined);
    }

    const loginCaptchaState = await this.browserManager.isCaptchaOrLoginRequired(page);
    if (loginCaptchaState) {
      const screenshotPath = await this.browserManager.captureScreenshot(accountId, loginCaptchaState.status);
      throw new BrowserConversionError(
        loginCaptchaState.status === "login_required" ? "LOGIN_REQUIRED" : "CAPTCHA_REQUIRED",
        loginCaptchaState.reason,
        true,
        loginCaptchaState.status,
        screenshotPath ?? undefined
      );
    }

    await this.store.logStage(jobId, "PAGE_OPENED", { accountId, originalUrl, subId: finalSubId, currentUrl: page.url() });
    await this.fillOriginalUrl(page, originalUrl, jobId, accountId, finalSubId);
    await this.fillSubIds(page, subIds, finalSubId, jobId, accountId, originalUrl);
    await this.clickConvert(page, jobId, accountId, originalUrl, finalSubId);
    return this.waitForOutput(page, originalUrl, outputType, jobId, accountId, finalSubId);
  }

  private async fillOriginalUrl(page: Page, originalUrl: string, jobId: string, accountId: string, subId: string) {
    const selectors = [
      "textarea[placeholder*='http']",
      "textarea[placeholder*='link' i]",
      "textarea[placeholder*='URL' i]",
      "textarea",
      "input[placeholder*='http']",
      "input[placeholder*='link' i]",
      "input[placeholder*='URL' i]",
      "input[name*='link' i]",
      "input[id*='link' i]",
      "[contenteditable='true']"
    ];
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if (await locator.count().catch(() => 0) === 0) continue;
      const visible = await locator.isVisible().catch(() => false);
      if (!visible) continue;
      await locator.fill(originalUrl).catch(async () => {
        await locator.click();
        await page.keyboard.press("Control+A");
        await page.keyboard.type(originalUrl);
      });
      await this.store.logStage(jobId, "INPUT_ORIGINAL_URL", { accountId, originalUrl, subId, currentUrl: page.url() });
      return;
    }
    const screenshotPath = await this.browserManager.captureScreenshot(accountId, "selector_original_url");
    throw new BrowserConversionError("SELECTOR_NOT_FOUND", "Không tìm thấy ô nhập URL trên Shopee Affiliate Converter Page.", true, "failed", screenshotPath ?? undefined);
  }

  private async fillSubIds(page: Page, subIds: string[], finalSubId: string, jobId: string, accountId: string, originalUrl: string) {
    const sanitized = padSubIds(subIds).map(sanitizeSubIdSegment);
    let filled = 0;
    for (let index = 0; index < 5; index++) {
      const value = sanitized[index] ?? "";
      const selectors = [
        `#customLink_sub_id${index + 1}`,
        `input[name='subId${index + 1}']`,
        `input[name='sub_id${index + 1}']`,
        `input[id*='sub'][id*='${index + 1}']`,
        `input[placeholder*='Sub_id${index + 1}' i]`,
        `input[placeholder*='Sub ID ${index + 1}' i]`
      ];
      const target = await this.findVisibleLocator(page, selectors);
      if (!target) continue;
      await target.fill(value);
      filled += 1;
    }

    if (filled === 0 && finalSubId) {
      const singleSubIdTarget = await this.findVisibleLocator(page, [
        "input[name='subId']",
        "input[name='sub_id']",
        "input[id*='sub' i]",
        "input[placeholder*='Sub' i]"
      ]);
      if (singleSubIdTarget) {
        await singleSubIdTarget.fill(finalSubId);
        filled = 1;
      }
    }

    await this.store.logStage(jobId, "INPUT_SUB_ID", {
      accountId,
      originalUrl,
      subId: finalSubId,
      subIdFieldCount: filled,
      currentUrl: page.url()
    });
  }

  private async clickConvert(page: Page, jobId: string, accountId: string, originalUrl: string, subId: string) {
    const roleButton = page.getByRole("button", {
      name: /lấy link|lay link|get link|generate|tạo link|tao link|convert|create/i
    }).first();
    if (await roleButton.count().catch(() => 0) > 0 && await roleButton.isVisible().catch(() => false)) {
      await roleButton.click();
      await this.store.logStage(jobId, "CLICK_CONVERT", { accountId, originalUrl, subId, currentUrl: page.url() });
      return;
    }

    const target = await this.findVisibleLocator(page, [
      "button:has-text('Lấy link')",
      "button:has-text('Get Link')",
      "button:has-text('Generate')",
      "button:has-text('Tạo link')",
      "button:has-text('Convert')",
      "button[type='submit']",
      ".ant-btn-primary"
    ]);
    if (!target) {
      const screenshotPath = await this.browserManager.captureScreenshot(accountId, "selector_convert_button");
      throw new BrowserConversionError("SELECTOR_NOT_FOUND", "Không tìm thấy nút convert trên Shopee Affiliate Converter Page.", true, "failed", screenshotPath ?? undefined);
    }
    await target.click();
    await this.store.logStage(jobId, "CLICK_CONVERT", { accountId, originalUrl, subId, currentUrl: page.url() });
  }

  private async waitForOutput(page: Page, originalUrl: string, outputType: "shortlink" | "full", jobId: string, accountId: string, subId: string) {
    await this.store.logStage(jobId, "WAIT_OUTPUT", { accountId, originalUrl, subId, currentUrl: page.url() });
    const startedAt = Date.now();
    while (Date.now() - startedAt < conversionTimeoutMs) {
      const loginCaptchaState = await this.browserManager.isCaptchaOrLoginRequired(page);
      if (loginCaptchaState) {
        const screenshotPath = await this.browserManager.captureScreenshot(accountId, loginCaptchaState.status);
        throw new BrowserConversionError(
          loginCaptchaState.status === "login_required" ? "LOGIN_REQUIRED" : "CAPTCHA_REQUIRED",
          loginCaptchaState.reason,
          true,
          loginCaptchaState.status,
          screenshotPath ?? undefined
        );
      }

      const candidates = await page.evaluate(() => {
        const values = Array.from(document.querySelectorAll("textarea,input,a"))
          .flatMap((node) => {
            if (node instanceof HTMLAnchorElement) return [node.href, node.textContent ?? ""];
            if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) return [node.value, node.getAttribute("value") ?? ""];
            return [node.textContent ?? ""];
          });
        const bodyText = document.body?.innerText ?? "";
        const source = [...values, bodyText].join("\n");
        return source.match(/https?:\/\/(?:s\.shopee\.vn|shopee\.ee|[^\s"'<>]*shopee\.[^\s"'<>]+)[^\s"'<>]*/gi) ?? [];
      });
      const convertedUrl = pickConvertedUrl(candidates, originalUrl, outputType);
      if (convertedUrl) {
        await this.store.logStage(jobId, "OUTPUT_CAPTURED", {
          accountId,
          originalUrl,
          subId,
          convertedUrl,
          currentUrl: page.url()
        });
        return { convertedUrl, currentUrl: page.url() };
      }
      await page.waitForTimeout(1_000);
    }

    const screenshotPath = await this.browserManager.captureScreenshot(accountId, "output_not_found");
    throw new BrowserConversionError("CONVERSION_OUTPUT_NOT_FOUND", "Không thấy link đã convert sau thời gian chờ.", true, "failed", screenshotPath ?? undefined);
  }

  private async findVisibleLocator(page: Page, selectors: string[]) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if (await locator.count().catch(() => 0) === 0) continue;
      if (await locator.isVisible().catch(() => false)) return locator;
    }
    return null;
  }
}

class ShopeeLinkConversionQueue {
  private readonly queuedByAccount = new Map<string, string[]>();
  private readonly runningByAccount = new Map<string, string>();
  private readonly pausedAccounts = new Set<string>();
  private readonly cancelledJobs = new Set<string>();

  constructor(
    private readonly store: BrowserConvertStore,
    private readonly converter: ShopeeLinkConverter,
    private readonly browserManager: ShopeeBrowserManager,
    private readonly sessionManager: ShopeeSessionManager,
    private readonly notifier: TelegramAdminNotifier
  ) {}

  async enqueue(jobId: string, accountId = SHOPEE_ACCOUNT_ID) {
    assertShopeeAccount(accountId);
    const queue = this.getQueue(accountId);
    if (!queue.includes(jobId) && this.runningByAccount.get(accountId) !== jobId) {
      queue.push(jobId);
    }
    void this.drain(accountId);
    return this.getQueueStatus(accountId);
  }

  async retry(jobId: string) {
    const job = await this.store.getJob(jobId);
    if (!job) return null;
    const accountId = String(job.metadata.accountId ?? SHOPEE_ACCOUNT_ID);
    assertShopeeAccount(accountId);
    await this.store.markQueued(jobId);
    this.cancelledJobs.delete(jobId);
    this.pausedAccounts.delete(accountId);
    await this.enqueue(jobId, accountId);
    return this.store.getJob(jobId);
  }

  async cancel(jobId: string) {
    const job = await this.store.getJob(jobId);
    if (!job) return null;
    const accountId = String(job.metadata.accountId ?? SHOPEE_ACCOUNT_ID);
    assertShopeeAccount(accountId);
    this.cancelledJobs.add(jobId);
    const queue = this.getQueue(accountId);
    this.queuedByAccount.set(accountId, queue.filter((id) => id !== jobId));
    await this.store.markCancelled(jobId);
    return this.store.getJob(jobId);
  }

  async markResolved(accountId = SHOPEE_ACCOUNT_ID) {
    assertShopeeAccount(accountId);
    const status = await this.browserManager.markCaptchaResolved(accountId);
    if (!blockedSessionStatuses.has(status)) {
      this.pausedAccounts.delete(accountId);
      void this.drain(accountId);
    } else {
      this.pausedAccounts.add(accountId);
    }
    return status;
  }

  getQueueStatus(accountId = SHOPEE_ACCOUNT_ID): QueueStatus {
    const queuedJobIds = [...this.getQueue(accountId)];
    return {
      runningJobId: this.runningByAccount.get(accountId) ?? null,
      queuedJobIds,
      queuedCount: queuedJobIds.length,
      paused: this.pausedAccounts.has(accountId)
    };
  }

  async recover() {
    const jobIds = await this.store.recoverQueuedJobs();
    for (const jobId of jobIds) await this.enqueue(jobId, SHOPEE_ACCOUNT_ID);
  }

  private getQueue(accountId: string) {
    const queue = this.queuedByAccount.get(accountId) ?? [];
    if (!this.queuedByAccount.has(accountId)) this.queuedByAccount.set(accountId, queue);
    return queue;
  }

  private async drain(accountId: string) {
    if (this.runningByAccount.has(accountId) || this.pausedAccounts.has(accountId)) return;
    const sessionStatus = await this.sessionManager.getStatus(accountId);
    if (blockedSessionStatuses.has(sessionStatus)) {
      this.pausedAccounts.add(accountId);
      return;
    }

    const queue = this.getQueue(accountId);
    const jobId = queue.shift();
    if (!jobId) return;
    const job = await this.store.getJob(jobId);
    if (!job || job.status !== "queued") {
      void this.drain(accountId);
      return;
    }

    this.runningByAccount.set(accountId, jobId);
    await this.process(jobId, accountId).finally(() => {
      this.runningByAccount.delete(accountId);
    });

    if (!this.pausedAccounts.has(accountId)) void this.drain(accountId);
  }

  private async process(jobId: string, accountId: string) {
    if (this.cancelledJobs.has(jobId)) return;
    await this.store.markRunning(jobId);
    await this.sessionManager.updateStatus(accountId, "busy", { lastHealthCheckAt: nowIso() });

    try {
      const result = await this.converter.convert(jobId);
      if (this.cancelledJobs.has(jobId)) return;
      await this.store.markSuccess(jobId, result.convertedUrl, result.currentUrl);
      await this.sessionManager.updateStatus(accountId, "ready", {
        currentUrl: result.currentUrl,
        lastError: null,
        lastHealthCheckAt: nowIso()
      });
    } catch (error) {
      const normalized = error instanceof BrowserConversionError
        ? error
        : new BrowserConversionError("UNKNOWN_ERROR", readErrorMessage(error), true, "failed");
      const state = await this.sessionManager.getSession(accountId);
      const currentUrl = asRecord(state?.data).currentUrl;
      await this.store.markError(jobId, normalized, typeof currentUrl === "string" ? currentUrl : null);

      if (normalized.jobStatus === "waiting_captcha" || normalized.jobStatus === "login_required") {
        this.pausedAccounts.add(accountId);
        await this.sessionManager.updateStatus(accountId, normalized.jobStatus, {
          lastError: normalized.message,
          lastScreenshotPath: normalized.screenshotPath ?? null,
          lastHealthCheckAt: nowIso()
        });
        const latest = await this.store.getJob(jobId);
        await this.notifier.sendCaptchaLoginAlert({
          jobId,
          status: normalized.jobStatus,
          currentUrl: typeof currentUrl === "string" ? currentUrl : "",
          originalUrl: String(latest?.originalUrl ?? ""),
          screenshotPath: normalized.screenshotPath
        }).catch(() => undefined);
      } else {
        await this.sessionManager.updateStatus(accountId, "ready", {
          lastError: normalized.message,
          lastScreenshotPath: normalized.screenshotPath ?? null,
          lastHealthCheckAt: nowIso()
        });
      }
    }
  }
}

let services:
  | {
      sessionManager: ShopeeSessionManager;
      browserManager: ShopeeBrowserManager;
      store: BrowserConvertStore;
      queue: ShopeeLinkConversionQueue;
    }
  | undefined;

function getServices(prisma: PrismaClient) {
  if (services) return services;
  const sessionManager = new ShopeeSessionManager(prisma);
  const browserManager = new ShopeeBrowserManager(sessionManager);
  const store = new BrowserConvertStore(prisma);
  const converter = new ShopeeLinkConverter(browserManager, store);
  const notifier = new TelegramAdminNotifier(prisma);
  const queue = new ShopeeLinkConversionQueue(store, converter, browserManager, sessionManager, notifier);
  services = { sessionManager, browserManager, store, queue };
  return services;
}

function parseBrowserConvertInput(body: Record<string, unknown>): BrowserConvertInput {
  const platform = String(body.platform ?? SHOPEE_PLATFORM).trim().toLowerCase();
  const accountId = String(body.accountId ?? SHOPEE_ACCOUNT_ID).trim();
  const mode = String(body.mode ?? BROWSER_ACTION).trim();
  const url = String(body.url ?? body.originalUrl ?? "").trim();
  const outputTypeRaw = String(body.outputType ?? "shortlink").trim();
  const outputType = outputTypeRaw === "full" ? "full" : "shortlink";
  const subIds = Array.isArray(body.subIds) ? body.subIds.map((item) => String(item ?? "")) : [];
  const source = String(body.source ?? "convert_link_tool").trim() || "convert_link_tool";
  const subId = body.subId !== undefined ? String(body.subId ?? "") : undefined;
  const sourceContentId = body.sourceContentId !== undefined ? String(body.sourceContentId ?? "") : undefined;

  if (platform !== SHOPEE_PLATFORM) {
    throw new BrowserConversionError("INVALID_INPUT_URL", "Giai đoạn 1 chỉ hỗ trợ nền tảng Shopee.", false, "failed");
  }
  if (accountId !== SHOPEE_ACCOUNT_ID) {
    throw new BrowserConversionError("SESSION_NOT_READY", `Giai đoạn 1 chỉ hỗ trợ accountId=${SHOPEE_ACCOUNT_ID}.`, false, "failed");
  }
  if (mode !== BROWSER_ACTION) {
    throw new BrowserConversionError("UNKNOWN_ERROR", `mode phải là ${BROWSER_ACTION}.`, false, "failed");
  }
  if (!url || !isShopeeUrl(url)) {
    throw new BrowserConversionError("INVALID_INPUT_URL", "URL Shopee không hợp lệ. Chỉ chấp nhận shopee.vn, s.shopee.vn hoặc shopee.ee.", false, "failed");
  }

  return {
    platform: SHOPEE_PLATFORM,
    url,
    subIds: padSubIds(subIds),
    subId,
    outputType,
    accountId,
    mode: BROWSER_ACTION,
    source,
    sourceContentId
  };
}

export async function registerShopeeBrowserConvertRoutes(app: FastifyInstance, prisma: PrismaClient = defaultPrisma) {
  const { browserManager, queue, sessionManager, store } = getServices(prisma);
  await queue.recover();

  app.addHook("onClose", async () => {
    await browserManager.shutdown();
  });

  app.post("/tools/convert-link/browser-convert", async (request, reply) => {
    let input: BrowserConvertInput;
    try {
      input = parseBrowserConvertInput((request.body ?? {}) as Record<string, unknown>);
    } catch (error) {
      const normalized = error instanceof BrowserConversionError
        ? error
        : new BrowserConversionError("UNKNOWN_ERROR", readErrorMessage(error), false, "failed");
      return reply.code(400).send(fail(normalized.code, normalized.message, { retryable: normalized.retryable }));
    }

    const run = await store.createJob(input);
    await queue.enqueue(run.id, input.accountId);
    return ok({
      jobId: run.id,
      status: "queued",
      message: `${SHOPEE_BROWSER_NAME} đã nhận job ${BROWSER_ACTION}.`
    });
  });

  app.get("/tools/convert-link/browser-convert/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await store.getJob(jobId);
    if (!job) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy browser conversion job."));
    return ok(job);
  });

  app.post("/tools/convert-link/browser-convert/:jobId/retry", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await queue.retry(jobId);
    if (!job) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy browser conversion job."));
    return ok({ jobId, status: job.status, message: "Đã đưa job vào hàng chờ retry." });
  });

  app.post("/tools/convert-link/browser-convert/:jobId/cancel", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await queue.cancel(jobId);
    if (!job) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy browser conversion job."));
    return ok({ jobId, status: "cancelled", message: "Đã hủy job convert link." });
  });

  app.get("/browser-sessions/shopee-main", async () => {
    await browserManager.getSessionStatus(SHOPEE_ACCOUNT_ID);
    return ok(await sessionManager.buildPayload(SHOPEE_ACCOUNT_ID, queue.getQueueStatus(SHOPEE_ACCOUNT_ID)));
  });

  app.post("/browser-sessions/shopee-main/start", async () => {
    await browserManager.startSession(SHOPEE_ACCOUNT_ID);
    return ok(await sessionManager.buildPayload(SHOPEE_ACCOUNT_ID, queue.getQueueStatus(SHOPEE_ACCOUNT_ID)));
  });

  app.post("/browser-sessions/shopee-main/stop", async () => {
    await browserManager.stopSession(SHOPEE_ACCOUNT_ID);
    return ok(await sessionManager.buildPayload(SHOPEE_ACCOUNT_ID, queue.getQueueStatus(SHOPEE_ACCOUNT_ID)));
  });

  app.post("/browser-sessions/shopee-main/restart", async () => {
    await browserManager.restartSession(SHOPEE_ACCOUNT_ID);
    return ok(await sessionManager.buildPayload(SHOPEE_ACCOUNT_ID, queue.getQueueStatus(SHOPEE_ACCOUNT_ID)));
  });

  app.post("/browser-sessions/shopee-main/mark-resolved", async () => {
    await queue.markResolved(SHOPEE_ACCOUNT_ID);
    return ok(await sessionManager.buildPayload(SHOPEE_ACCOUNT_ID, queue.getQueueStatus(SHOPEE_ACCOUNT_ID)));
  });

  app.post("/browser-sessions/shopee-main/open", async () => {
    const page = await browserManager.openConverterPage(SHOPEE_ACCOUNT_ID);
    if (page.url() === "about:blank") {
      await browserManager.navigateConverterPage(SHOPEE_ACCOUNT_ID).catch(() => page);
    }
    await page.bringToFront().catch(() => undefined);
    return ok(await sessionManager.buildPayload(SHOPEE_ACCOUNT_ID, queue.getQueueStatus(SHOPEE_ACCOUNT_ID)));
  });

  app.get("/browser-sessions/shopee-main/screenshots/:filename", async (request, reply) => {
    const { filename } = request.params as { filename: string };
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "");
    const fullPath = path.join(screenshotDir, safeName);
    if (!existsSync(fullPath)) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy screenshot."));
    reply.header("Content-Type", "image/png");
    return reply.send(createReadStream(fullPath));
  });
}
