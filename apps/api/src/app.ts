import path from "node:path";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { Prisma, type CrawlResult } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import * as XLSX from "xlsx";
import { listTelegramDialogs, listZaloGroups } from "@zerun/adapters";
import { detectLinks, detectNetwork, expandUrl } from "@zerun/core";
import type { BrowserContext } from "playwright";
import { ensureDatabaseReady, prisma } from "@zerun/db";
import { buildPagination, fail, ok, readDesktopRuntime, realtimeBus, updateDesktopRuntimeConfig, type Platform } from "@zerun/shared";
import { createWorkerCore, type WorkerCore, AccessTradeAffiliateAdapter, LazadaAffiliateAdapter, OpenAICompatibleProvider, ShopeeAffiliateAdapter, ShopeeAffiliateIdAdapter, invalidateAiProviderCache } from "@zerun/worker-core";
import { config } from "./config.js";
import { zerunExtensionBridge } from "./zerun-extension-bridge.js";

type AnyBody = Record<string, any>;

// Copy guard: Quản lý tài khoản chỉ áp dụng cho tài khoản đăng của user.
// Không test tài khoản nguồn ở trang Quản lý tài khoản.

type BrowserLoginPlatform = "facebook" | "instagram" | "threads" | "x";

type BrowserLoginSession = {
  id: string;
  platform: BrowserLoginPlatform;
  accountId: string;
  sessionDir: string;
  authPath: string;
  status: "pending" | "completed" | "cancelled" | "failed";
  createdAt: number;
  browserContext?: BrowserContext;
  browserPid?: number;
  authDetected?: boolean;
  authState?: "unknown" | "authenticated" | "login_required" | "checkpoint";
  currentUrl?: string;
  cookieNames?: string[];
  lastCheckedAt?: number;
  lastError?: string;
};

const browserLoginSessions = new Map<string, BrowserLoginSession>();

type ConvertLinkBatch = {
  id: string;
  text: string;
  rows: Record<string, unknown>[];
  links: Array<{
    originalUrl: string;
    network: string;
    action: "convert" | "saved_for_review";
    reason?: string;
  }>;
  subIds: string[];
  results: Array<{
    originalUrl: string;
    convertedUrl?: string;
    failureReason?: string;
  }>;
  createdAt: string;
};

const convertLinkBatches = new Map<string, ConvertLinkBatch>();
const REPOST_SOURCE_HISTORY_MAX_ITEMS = 2000;

async function persistPlatformAccountSessionState(platform: BrowserLoginPlatform, accountId: string, payload: Record<string, unknown>) {
  return prisma.platformSession.upsert({
    where: {
      platform_accountKind_accountId: {
        platform,
        accountKind: "target",
        accountId
      }
    },
    create: {
      platform,
      accountKind: "target",
      accountId,
      status: String(payload.status ?? "unknown"),
      cookiePath: typeof payload.authPath === "string" ? payload.authPath : undefined,
      data: payload as Prisma.InputJsonValue
    },
    update: {
      status: String(payload.status ?? "unknown"),
      cookiePath: typeof payload.authPath === "string" ? payload.authPath : undefined,
      data: payload as Prisma.InputJsonValue
    }
  });
}

async function getPersistedPlatformAccountSessionState(platform: BrowserLoginPlatform, accountId: string) {
  return prisma.platformSession.findUnique({
    where: {
      platform_accountKind_accountId: {
        platform,
        accountKind: "target",
        accountId
      }
    }
  });
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    workerCore: WorkerCore;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  await ensureDatabaseReady();
  const app = Fastify({ logger: false });
  const workerCore = await createWorkerCore({ redisUrl: config.REDIS_URL });

  app.decorate("workerCore", workerCore);
  app.addHook("onClose", async () => {
    await workerCore.stop();
    await zerunExtensionBridge.stop();
    await prisma.$disconnect();
  });

  await app.register(fastifyCors, {
    origin: config.API_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true
  });
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    cookie: {
      cookieName: "accessToken",
      signed: false
    }
  });
  await app.register(fastifyMultipart);
  await app.register(fastifyWebsocket);
  await zerunExtensionBridge.start();

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send(fail("UNAUTHORIZED", "Bạn cần đăng nhập."));
    }
  });

  app.get("/api/health", async () => ok({ status: "ok", time: new Date().toISOString() }));

  await app.register(registerAuthRoutes, { prefix: "/api/v1/auth" });
  await app.register(registerWsRoute, { prefix: "/api/v1" });
  await app.register(registerProtectedRoutes, { prefix: "/api/v1" });
  await registerStaticWeb(app);

  return app;
}

async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/login", async (request, reply) => {
    const body = request.body as AnyBody;
    const username = String(body.username ?? "");
    const password = String(body.password ?? "");
    const user = await prisma.adminUser.findUnique({ where: { username } });

    if (!user || !user.isActive || !(await compare(password, user.passwordHash))) {
      return reply.code(401).send(fail("INVALID_CREDENTIALS", "Tên đăng nhập hoặc mật khẩu không đúng."));
    }

    const accessToken = app.jwt.sign({ sub: user.id, role: user.role }, { expiresIn: config.JWT_ACCESS_TTL });
    const refreshToken = randomUUID();
    const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        adminUserId: user.id,
        expiresAt
      }
    });

    reply.setCookie("accessToken", accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      path: "/"
    });

    return ok({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role
      }
    });
  });

  app.post("/refresh", async (request, reply) => {
    const body = request.body as AnyBody;
    const refreshToken = String(body.refreshToken ?? "");
    const token = await prisma.refreshToken.findUnique({ where: { token: refreshToken }, include: { adminUser: true } });

    if (!token || token.isRevoked || token.expiresAt < new Date() || !token.adminUser.isActive) {
      return reply.code(401).send(fail("INVALID_REFRESH_TOKEN", "Refresh token không hợp lệ."));
    }

    const accessToken = app.jwt.sign({ sub: token.adminUserId, role: token.adminUser.role }, { expiresIn: config.JWT_ACCESS_TTL });
    reply.setCookie("accessToken", accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      path: "/"
    });
    return ok({ accessToken });
  });

  app.post("/logout", async (request, reply) => {
    const body = request.body as AnyBody;
    const refreshToken = String(body.refreshToken ?? "");
    if (refreshToken) await prisma.refreshToken.updateMany({ where: { token: refreshToken }, data: { isRevoked: true } });
    reply.clearCookie("accessToken", { path: "/" });
    return ok({ success: true });
  });
}

async function registerWsRoute(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket) => {
    const unsubscribe = realtimeBus.onEvent((event) => socket.send(JSON.stringify(event)));
    socket.on("close", unsubscribe);
    socket.send(JSON.stringify({ type: "connected", createdAt: new Date().toISOString() }));
  });
}

async function registerProtectedRoutes(app: FastifyInstance) {
  app.get("/dashboard/stats", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [totalContents, pendingJobs, publishedToday, failedJobs, targets] = await Promise.all([
      prisma.content.count(),
      prisma.content.count({ where: { status: { in: ["waiting_link_convert", "waiting_manual_convert", "ready_to_publish", "scheduled", "publishing"] } } }),
      prisma.content.count({ where: { status: "published", updatedAt: { gte: today } } }),
      prisma.content.count({ where: { status: "failed" } }),
      prisma.targetAccount.findMany({ select: { id: true, name: true, platform: true, health: true, isActive: true } })
    ]);
    return ok({
      totalContents,
      pendingJobs,
      publishedToday,
      failedJobs,
      platformHealth: targets
    });
  });

  app.get("/dashboard/activity", async (request) => {
    const query = request.query as AnyBody;
    const limit = Math.min(Number(query.limit ?? 50), 100);
    const activities = await prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
    return ok({ activities });
  });

  registerContentRoutes(app);
  registerAutoConversionRoutes(app);
  registerCrawlRoutes(app);
  registerSourceRoutes(app);
  registerTargetRoutes(app);
  registerRoutingRoutes(app);
  registerLinkRoutes(app);
  registerConvertLinkToolRoutes(app);
  registerScheduleRoutes(app);
  registerAccountRoutes(app);
  registerAiRoutes(app);
  registerImportRoutes(app);
  registerFacebookBrowserLoginRoutes(app);
  registerFacebookRoutes(app);
  registerHistoryRoutes(app);
  registerFailedRoutes(app);
  registerCommentQueueRoutes(app);
  registerWorkerJobRoutes(app);
  registerExtendedSettingsRoutes(app);
  registerTelegramSettingsRoutes(app);
  registerRepostApiRoutes(app);
}

function registerHistoryRoutes(app: FastifyInstance) {
  app.get("/history", async (request) => {
    const query = request.query as AnyBody;
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const where: Prisma.PublishAttemptWhereInput = {};
    const successStatuses = ["published", "success"];
    const requestedStatus = String(query.status ?? "all");

    if (requestedStatus !== "all" && successStatuses.includes(requestedStatus)) {
      where.status = requestedStatus;
    } else {
      where.status = { in: successStatuses };
    }
    if (query.platform && String(query.platform) !== "all") {
      where.target = { is: { platform: String(query.platform) as Platform } };
    }
    const keyword = String(query.keyword ?? query.search ?? "").trim();
    if (keyword) {
      const contains = { contains: keyword, mode: "insensitive" as const };
      where.OR = [
        { status: contains },
        { error: contains },
        { resultUrl: contains },
        { content: { is: { code: contains } } },
        { content: { is: { originalText: contains } } },
        { content: { is: { draftText: contains } } },
        { content: { is: { finalText: contains } } },
        { target: { is: { name: contains } } },
        { target: { is: { platform: contains } } }
      ];
    }

    const sortOrder = String(query.sortOrder ?? "desc") === "asc" ? "asc" : "desc";
    const sortBy = String(query.sortBy ?? "createdAt");
    const orderBy: Prisma.PublishAttemptOrderByWithRelationInput =
      sortBy === "status" ? { status: sortOrder } :
      sortBy === "account" ? { target: { name: sortOrder } } :
      sortBy === "platform" ? { target: { platform: sortOrder } } :
      sortBy === "code" ? { content: { code: sortOrder } } :
      { createdAt: sortOrder };

    const [total, attempts] = await Promise.all([
      prisma.publishAttempt.count({ where }),
      prisma.publishAttempt.findMany({
        where,
        include: {
          content: {
            include: {
              links: true,
              media: true,
              source: true,
              commentQueues: {
                orderBy: { createdAt: "desc" },
                include: { target: { select: { id: true, name: true, platform: true } } }
              },
              publishAttempts: {
                orderBy: { createdAt: "desc" },
                take: 5,
                include: { target: { select: { id: true, name: true, platform: true } } }
              }
            }
          },
          target: { select: { id: true, name: true, platform: true } }
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    return ok({ attempts }, buildPagination(page, limit, total));
  });

  app.get("/history/:attemptId/comments", async (request, reply) => {
    const { attemptId } = request.params as { attemptId: string };
    const attempt = await prisma.publishAttempt.findUnique({ where: { id: attemptId }, select: { contentId: true, targetId: true } });
    if (!attempt) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy lần đăng."));

    const queuedComments = await prisma.commentQueue.findMany({
      where: { contentId: attempt.contentId, targetId: attempt.targetId },
      orderBy: { createdAt: "desc" }
    });

    const content = await prisma.content.findUnique({
      where: { id: attempt.contentId },
      select: { metadata: true, updatedAt: true, createdAt: true }
    });

    const metadata = (content?.metadata ?? {}) as Record<string, unknown>;
    const fallbackComment = typeof metadata.comment === "string" && metadata.comment.trim().length > 0
      ? [{
          id: `content-comment-${attemptId}`,
          commentText: metadata.comment,
          commentMedia: Array.isArray(metadata.commentMedia) ? metadata.commentMedia : [],
          status: attempt.targetId ? "draft" : "draft",
          scheduledAt: null,
          resultUrl: null,
          error: null,
          createdAt: (content?.updatedAt ?? content?.createdAt ?? new Date()).toISOString(),
          updatedAt: (content?.updatedAt ?? content?.createdAt ?? new Date()).toISOString()
        }]
      : [];

    return ok({ comments: queuedComments.length > 0 ? queuedComments : fallbackComment });
  });
}

function registerFailedRoutes(app: FastifyInstance) {
  app.get("/failed", async (request) => {
    const query = request.query as AnyBody;
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);

    const [total, contents] = await Promise.all([
      prisma.content.count({ where: { status: "failed" } }),
      prisma.content.findMany({
        where: { status: "failed" },
        include: {
          publishAttempts: {
            include: { target: { select: { id: true, name: true, platform: true } } },
            orderBy: { createdAt: "desc" },
            take: 5
          }
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    return ok({ contents }, buildPagination(page, limit, total));
  });

  app.post("/failed/:code/retry", async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = request.body as AnyBody;
    const content = await prisma.content.findUnique({
      where: { code },
      select: { id: true, status: true, platform: true, scheduledAt: true, scheduledTargets: true }
    });
    if (!content) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy nội dung."));

    let targetIds: string[] = [];
    if (Array.isArray(body.targetIds) && body.targetIds.length > 0) {
      targetIds = body.targetIds.map(String);
    } else if (Array.isArray(content.scheduledTargets) && (content.scheduledTargets as unknown[]).length > 0) {
      targetIds = (content.scheduledTargets as unknown[]).map(String);
    } else {
      const attempts = await prisma.publishAttempt.findMany({ where: { contentId: content.id }, orderBy: { createdAt: "desc" }, take: 5, select: { targetId: true } });
      targetIds = [...new Set(attempts.map((item) => item.targetId))];
    }

    const publishJobs = await resolvePublishJobs(targetIds);
    if (publishJobs.length === 0) return reply.code(400).send(fail("NO_TARGETS", "Cần chỉ định tài khoản đăng."));

    await prisma.content.update({ where: { code }, data: { status: "ready_to_publish" } });
    await Promise.all(publishJobs.map((job) => app.workerCore.publishNow(content.id, job.targetId, "admin", job.targetChannelId)));
    return ok({ queued: true, targetCount: publishJobs.length });
  });

  app.post("/failed/:code/reschedule", async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = request.body as AnyBody;
    const content = await prisma.content.findUnique({ where: { code } });
    if (!content) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy nội dung."));

    const scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      return reply.code(400).send(fail("BAD_REQUEST", "Cần cung cấp thời gian hẹn hợp lệ."));
    }

    const targetIds = Array.isArray(content.scheduledTargets) ? (content.scheduledTargets as unknown[]).map(String) : [];
    const schedules = await Promise.all(
      targetIds.map((targetId) =>
        prisma.schedule.create({
          data: { contentId: content.id, targetId, scheduledAt }
        })
      )
    );
    await prisma.content.update({ where: { code }, data: { status: "scheduled", scheduledAt } });
    await Promise.all(schedules.map((schedule) => app.workerCore.scheduleRelease(schedule.id, scheduledAt)));
    return ok({ rescheduled: true, targetCount: targetIds.length });
  });
}

function registerCommentQueueRoutes(app: FastifyInstance) {
  app.get("/pending-comments", async (request) => {
    const query = request.query as AnyBody;
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const where: Prisma.CommentQueueWhereInput = {};

    if (query.status && String(query.status) !== "all") {
      where.status = String(query.status);
    } else {
      where.status = { in: ["pending", "failed"] };
    }

    const [total, comments] = await Promise.all([
      prisma.commentQueue.count({ where }),
      prisma.commentQueue.findMany({
        where,
        include: {
          content: { select: { id: true, code: true, originalText: true, draftText: true, finalText: true } },
          target: { select: { id: true, name: true, platform: true } }
        },
        orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    return ok({ comments }, buildPagination(page, limit, total));
  });

  app.post("/pending-comments/:id/retry", async (request, reply) => {
    const { id } = request.params as { id: string };
    const comment = await prisma.commentQueue.findUnique({ where: { id } });
    if (!comment) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy comment."));
    const scheduledAt = new Date();
    await prisma.commentQueue.update({ where: { id }, data: { status: "pending", scheduledAt, error: null, updatedAt: new Date() } });
    await app.workerCore.scheduleComment(id, scheduledAt);
    return ok({ queued: true });
  });

  app.post("/pending-comments/:id/reschedule", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    const scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return reply.code(400).send(fail("BAD_REQUEST", "Cần cung cấp thời gian hẹn hợp lệ."));
    const comment = await prisma.commentQueue.findUnique({ where: { id } });
    if (!comment) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy comment."));
    await prisma.commentQueue.update({ where: { id }, data: { status: "pending", scheduledAt, error: null } });
    await app.workerCore.scheduleComment(id, scheduledAt);
    return ok({ rescheduled: true });
  });

  app.delete("/pending-comments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const comment = await prisma.commentQueue.findUnique({ where: { id } });
    if (!comment) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy comment."));
    await prisma.commentQueue.update({ where: { id }, data: { status: "cancelled" } });
    return ok({ cancelled: true });
  });
}

function registerWorkerJobRoutes(app: FastifyInstance) {
  app.get("/worker-jobs", async (request) => {
    const query = request.query as AnyBody;
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const where: Prisma.WorkerJobLogWhereInput = {};
    if (query.queueName && String(query.queueName) !== "all") where.queueName = String(query.queueName);
    if (query.status && String(query.status) !== "all") where.status = String(query.status);
    if (query.jobName && String(query.jobName) !== "all") where.jobName = String(query.jobName);

    const [total, jobs, grouped] = await Promise.all([
      prisma.workerJobLog.count({ where }),
      prisma.workerJobLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.workerJobLog.groupBy({ by: ["queueName", "status"], _count: { _all: true } })
    ]);

    return ok({ jobs, summary: grouped }, buildPagination(page, limit, total));
  });

  app.post("/worker-jobs/:id/retry-log", async (request, reply) => {
    const { id } = request.params as { id: string };
    const current = await prisma.workerJobLog.findUnique({ where: { id } });
    if (!current) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy worker job."));
    const job = await prisma.workerJobLog.create({
      data: {
        queueName: current.queueName,
        jobName: current.jobName,
        jobId: current.jobId,
        status: "queued",
        payload: current.payload ?? undefined
      }
    });
    return ok({ queued: true, job });
  });
}

function registerSettingSection(app: FastifyInstance, route: string, key: string, defaults: Record<string, unknown>) {
  app.get(route, async () => {
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    return ok(setting?.value ?? defaults);
  });

  app.put(route, async (request) => {
    const body = request.body as AnyBody;
    const value = { ...defaults, ...body };
    await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value }
    });
    return ok({ saved: true, value });
  });
}

function registerExtendedSettingsRoutes(app: FastifyInstance) {
  app.get("/settings/runtime", async () => ok({ runtime: formatRuntimeSettings(readDesktopRuntime()) }));

  app.put("/settings/runtime", async (request) => {
    const body = request.body as AnyBody;
    const server = (body.server ?? {}) as AnyBody;
    const tunnel = (body.tunnel ?? {}) as AnyBody;
    const exposeLan = readRuntimeBoolean(server.exposeLan ?? server.expose_lan, false);
    const port = Math.max(1, Math.min(65535, Number(server.port ?? 3000)));
    const runtime = updateDesktopRuntimeConfig({
      server: {
        port,
        exposeLan,
        host: String(server.host ?? (exposeLan ? "0.0.0.0" : "127.0.0.1"))
      },
      tunnel: {
        enabled: readRuntimeBoolean(tunnel.enabled, false),
        provider: String(tunnel.provider ?? "cloudflare"),
        token: String(tunnel.token ?? ""),
        publicUrl: String(tunnel.publicUrl ?? tunnel.public_url ?? "")
      }
    });
    return ok({ saved: true, restartRequired: true, runtime: formatRuntimeSettings(runtime) });
  });

  registerAiSettingsRoutes(app);
  registerSettingSection(app, "/settings/cloudinary", "cloudinary_settings", {
    keys: [],
    enabled: false
  });
  registerSettingSection(app, "/settings/affiliate", "affiliate_settings", {
    networks: ["shopee", "lazada"],
    shopeeRule: { enabled: true },
    lazadaRule: { enabled: true },
    unknownLinkAction: "saved_for_review"
  });


  app.post("/settings/affiliate/test-conversion", async (request) => {
    const body = request.body as AnyBody;
    const platform = String(body.platform ?? "");
    const configData = (body.config ?? {}) as AnyBody;
    const testUrl = String(body.testUrl ?? "").trim();

    if (!testUrl) {
      return fail("BAD_REQUEST", "URL test không được để trống");
    }

    try {
      if (platform === "shopee") {
        const makeAdapter = (source: string) => {
          if (source === "web") {
            return new ShopeeAffiliateAdapter({
              mode: "web",
              accessTradeToken: configData.accessTradeToken || undefined,
              accessTradeCampaignId: configData.campaignId || undefined,
              getPage: async () => {
                const workerShopee = app.workerCore?.registry?.affiliateAdapter as any;
                return workerShopee?.getPage?.() || null;
              }
            });
          }
          return new AccessTradeAffiliateAdapter({
            token: configData.accessTradeToken || undefined,
            defaultCampaignId: configData.campaignId || undefined
          });
        };

        const primaryAdapter = makeAdapter(configData.primarySource);
        let result = await primaryAdapter.convert({
          url: testUrl,
          network: "shopee",
          campaignId: configData.campaignId || undefined,
          subId: configData.subId || undefined
        });

        if (!result.success && configData.useFallback && configData.fallbackSource !== configData.primarySource) {
          const fallbackAdapter = makeAdapter(configData.fallbackSource);
          result = await fallbackAdapter.convert({
            url: testUrl,
            network: "shopee",
            campaignId: configData.campaignId || undefined,
            subId: configData.subId || undefined
          });
        }

        // Fallback convert thủ công nếu các phương thức trên thất bại và có affiliateId
        if (!result.success && configData.affiliateId) {
          try {
            const resolvedUrl = await expandUrl(testUrl, followRedirectUrl);
            const fallbackUrl = buildManualShopeeAffiliateLink(
              resolvedUrl,
              configData.affiliateId,
              undefined,
              configData.subId,
              configData
            );
            return ok({ success: true, converted: fallbackUrl, via: "manual_fallback" });
          } catch (e) {
            // ignore
          }
        }

        return ok({ success: result.success, converted: result.converted, error: result.error });
      }

      if (platform === "lazada") {
        const makeAdapter = (source: string) => {
          if (source === "lazada_api" || source === "api") {
            return new LazadaAffiliateAdapter({
              appKey: configData.appKey || undefined,
              appSecret: configData.appSecret || undefined,
              accessToken: configData.accessToken || undefined,
              region: configData.region || "VN"
            });
          }
          return new AccessTradeAffiliateAdapter({
            token: configData.accessTradeToken || undefined,
            defaultCampaignId: configData.campaignId || undefined
          });
        };

        const primaryAdapter = makeAdapter(configData.primarySource);
        const subIdStr = typeof configData.subIds === "object" ? JSON.stringify(configData.subIds) : undefined;
        
        let result = await primaryAdapter.convert({
          url: testUrl,
          network: "lazada",
          campaignId: configData.campaignId || undefined,
          subId: subIdStr
        });

        if (!result.success && configData.useFallback && configData.fallbackSource !== configData.primarySource) {
          const fallbackAdapter = makeAdapter(configData.fallbackSource);
          result = await fallbackAdapter.convert({
            url: testUrl,
            network: "lazada",
            campaignId: configData.campaignId || undefined,
            subId: subIdStr
          });
        }

        return ok({ success: result.success, converted: result.converted, error: result.error });
      }

      if (platform === "tiktok" || platform === "tiktokShop") {
        const adapter = new AccessTradeAffiliateAdapter({
          token: configData.accessTradeToken || undefined,
          defaultCampaignId: configData.campaignId || undefined
        });
        const trackingStr = typeof configData.tracking === "object" ? JSON.stringify(configData.tracking) : undefined;
        
        const result = await adapter.convert({
          url: testUrl,
          network: "tiktok_shop" as any,
          campaignId: configData.campaignId || undefined,
          subId: trackingStr
        });

        return ok({ success: result.success, converted: result.converted, error: result.error });
      }

      return fail("BAD_REQUEST", `Không hỗ trợ nền tảng test: ${platform}`);
    } catch (error) {
      return ok({
        success: false,
        converted: null,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/settings/maintenance/run", async (request) => {
    const body = request.body as AnyBody;
    const kind = (body.kind as "media" | "orphan" | "all") ?? "all";
    const retentionDays = Math.max(1, Math.min(365, Number(body.retentionDays ?? 30)));
    const dryRun = Boolean(body.dryRun);

    await app.workerCore!.runMaintenance({ kind, retentionDays, dryRun });
    return ok({
      queued: true,
      kind,
      retentionDays,
      dryRun,
      message: dryRun ? "Dry-run cleanup đã được queue. Kiểm tra activity log để xem kết quả." : "Cleanup đã được queue. Kiểm tra activity log để xem kết quả."
    });
  });

  app.get("/settings/maintenance/stats", async () => {
    const mediaDir = process.env.MEDIA_STORAGE_DIR ?? process.env.MEDIA_UPLOAD_ROOT ?? "storage/media";
    const { promises: fs } = await import("fs");

    let totalFiles = 0;
    let totalSize = 0;

    async function countFiles(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = `${dir}/${entry.name}`;
          if (entry.isDirectory()) {
            await countFiles(fullPath);
          } else if (entry.isFile()) {
            const stats = await fs.stat(fullPath);
            totalFiles++;
            totalSize += stats.size;
          }
        }
      } catch {
        // Ignore errors
      }
    }

    await countFiles(mediaDir);

    const dbMediaCount = await prisma.mediaAsset.count({ where: { localPath: { not: null } } });
    const oldActivityCount = await prisma.activityLog.count({
      where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
    });

    return ok({
      media: {
        directory: mediaDir,
        totalFiles,
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        dbReferencedCount: dbMediaCount
      },
      logs: {
        oldActivityCount30Days: oldActivityCount
      }
    });
  });

  app.post("/settings/ai/test", async (request) => {
    const body = request.body as AnyBody;
    return ok({
      output: `Ví dụ tiếng Việt có dấu: ${String(body.text ?? "Nội dung được viết lại sẽ giữ nguyên ý chính.")}`,
      provider: body.provider ?? "manual"
    });
  });
}

const DEFAULT_AI_SETTINGS = {
  provider: "",
  apiKey: "",
  model: "",
  rewritePrompt: "Viết lại nội dung tự nhiên bằng tiếng Việt có dấu, giữ ý chính và bỏ link không hợp lệ nếu cần.",
  removeInvalidLinkPrompt: "Xóa hoặc viết lại đoạn chứa link không hỗ trợ, không làm mất ý chính."
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBaseUrl(value: unknown) {
  return normalizeString(value).replace(/\/+$/, "");
}

function readAiSettingsPayload(value: unknown) {
  const body = value && typeof value === "object" && !Array.isArray(value) ? value as AnyBody : {};
  return {
    provider: normalizeBaseUrl(body.provider ?? body.baseUrl ?? body.endpoint),
    apiKey: normalizeString(body.apiKey),
    model: normalizeString(body.model),
    rewritePrompt: normalizeString(body.rewritePrompt) || DEFAULT_AI_SETTINGS.rewritePrompt,
    removeInvalidLinkPrompt: normalizeString(body.removeInvalidLinkPrompt) || DEFAULT_AI_SETTINGS.removeInvalidLinkPrompt
  };
}

async function readAiSettings() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "ai_settings" } });
  const saved = { ...DEFAULT_AI_SETTINGS, ...((setting?.value ?? {}) as AnyBody) } as AnyBody;
  return {
    provider: normalizeBaseUrl(saved.baseUrl ?? saved.provider ?? saved.endpoint),
    apiKey: normalizeString(saved.apiKey),
    model: normalizeString(saved.model),
    rewritePrompt: normalizeString(saved.rewritePrompt) || DEFAULT_AI_SETTINGS.rewritePrompt,
    removeInvalidLinkPrompt: normalizeString(saved.removeInvalidLinkPrompt) || DEFAULT_AI_SETTINGS.removeInvalidLinkPrompt
  };
}

async function saveAiSettings(settings: ReturnType<typeof readAiSettingsPayload>) {
  await prisma.systemSetting.upsert({
    where: { key: "ai_settings" },
    create: { key: "ai_settings", value: settings },
    update: { value: settings }
  });
  invalidateAiProviderCache();
}

function registerAiSettingsRoutes(app: FastifyInstance) {
  app.get("/settings/ai", async () => ok(await readAiSettings()));

  app.put("/settings/ai", async (request) => {
    const settings = readAiSettingsPayload(request.body);
    await saveAiSettings(settings);
    return ok({ saved: true, value: settings });
  });

  app.post("/settings/ai/test-connection", async (request, reply) => {
    const settings = readAiSettingsPayload(request.body);
    if (!settings.provider) return reply.code(400).send(fail("AI_BASE_URL_REQUIRED", "Cần nhập Base URL của AI."));
    if (!settings.apiKey) return reply.code(400).send(fail("AI_API_KEY_REQUIRED", "Cần nhập API key của AI."));

    const provider = new OpenAICompatibleProvider({
      baseUrl: settings.provider,
      apiKey: settings.apiKey,
      model: settings.model || "auto"
    });
    const result = await provider.testConnection();
    if (result.ok) await saveAiSettings(settings);
    return ok(result);
  });
}

function formatRuntimeSettings(runtime: ReturnType<typeof readDesktopRuntime>) {
  return {
    appId: runtime.appId,
    appDataDir: runtime.appDataDir,
    configPath: runtime.configPath,
    dbPath: runtime.dbPath,
    databaseUrl: runtime.databaseUrl,
    server: runtime.config.server,
    tunnel: runtime.config.tunnel,
    storage: runtime.config.storage
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function readRuntimeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1" || value === "on";
  if (typeof value === "number") return value !== 0;
  return fallback;
}

function registerTelegramSettingsRoutes(app: FastifyInstance) {
  app.get("/settings/telegram", async () => {
    const setting = await prisma.systemSetting.findUnique({ where: { key: "telegram_notify" } });
    const data = (setting?.value ?? {}) as Record<string, unknown>;
    return ok({
      botToken: data.botToken ?? "",
      chatId: data.chatId ?? "",
      enabled: data.enabled ?? false,
      notifyOnError: data.notifyOnError ?? true,
      notifyOnPublish: data.notifyOnPublish ?? false
    });
  });

  app.put("/settings/telegram", async (request) => {
    const body = request.body as AnyBody;
    await prisma.systemSetting.upsert({
      where: { key: "telegram_notify" },
      create: {
        key: "telegram_notify",
        value: {
          botToken: String(body.botToken ?? ""),
          chatId: String(body.chatId ?? ""),
          enabled: Boolean(body.enabled),
          notifyOnError: Boolean(body.notifyOnError ?? true),
          notifyOnPublish: Boolean(body.notifyOnPublish ?? false)
        }
      },
      update: {
        value: {
          botToken: String(body.botToken ?? ""),
          chatId: String(body.chatId ?? ""),
          enabled: Boolean(body.enabled),
          notifyOnError: Boolean(body.notifyOnError ?? true),
          notifyOnPublish: Boolean(body.notifyOnPublish ?? false)
        }
      }
    });
    return ok({ saved: true });
  });

  app.post("/settings/telegram/test", async (request, reply) => {
    const body = request.body as AnyBody;
    const botToken = String(body.botToken ?? "").trim();
    const chatId = String(body.chatId ?? "").trim();

    if (!botToken || !chatId) {
      return reply.code(400).send(fail("BAD_REQUEST", "Cần nhập Bot Token và Chat ID để gửi thử Telegram."));
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "Zerun đã kết nối cảnh báo Telegram thành công."
      })
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;

    if (!response.ok || payload.ok !== true) {
      const description = typeof payload.description === "string" ? payload.description : response.statusText;
      return reply.code(400).send(fail("TELEGRAM_TEST_FAILED", `Gửi thử Telegram thất bại: ${description}`));
    }

    return ok({ sent: true });
  });
}

function buildContentWhere(input: AnyBody): Prisma.ContentWhereInput {
  const where: Prisma.ContentWhereInput = {};
  const status = input.status ? String(input.status) : "";

  if (status && status !== "all") {
    const statuses = status.split(",").map((item) => item.trim()).filter(Boolean);
    where.status = statuses.length > 1 ? { in: statuses } : status;
  }

  if (status !== "trashed" && !input.includeTrash) {
    where.deletedAt = null;
  }

  if (input.platform && String(input.platform) !== "all") {
    where.platform = String(input.platform);
  }

  if (input.dateFrom || input.dateTo) {
    where.createdAt = {
      ...(input.dateFrom ? { gte: new Date(String(input.dateFrom)) } : {}),
      ...(input.dateTo ? { lte: new Date(String(input.dateTo)) } : {})
    };
  }

  const keyword = String(input.keyword ?? input.search ?? "").trim();
  if (keyword) {
    const contains = { contains: keyword, mode: "insensitive" as const };
    where.OR = [
      { code: contains },
      { platform: contains },
      { status: contains },
      { originalText: contains },
      { draftText: contains },
      { finalText: contains },
      { savedReason: contains },
      { lastError: contains }
    ];
  }

  return where;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map(String).map((value) => value.trim()).filter(Boolean))];
}

function parseDateInput(value: unknown): Date | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function inferMediaType(mediaPath: string) {
  const normalized = mediaPath.split("?")[0].toLowerCase();
  if (/\.(mp4|mov|avi|webm|mkv)$/.test(normalized)) return "video";
  if (/\.(jpg|jpeg|png|gif|webp|avif)$/.test(normalized)) return "image";
  return "document";
}

function inferMimeType(mediaPath: string) {
  const normalized = mediaPath.split("?")[0].toLowerCase();
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".mp4")) return "video/mp4";
  if (normalized.endsWith(".mov")) return "video/quicktime";
  if (normalized.endsWith(".webm")) return "video/webm";
  return undefined;
}

function normalizePathList(value: unknown) {
  if (Array.isArray(value)) return uniqueStrings(value.map(String));
  if (typeof value === "string") return parseJsonArray(value);
  return [];
}

function normalizeThreadsMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const topicTag = typeof raw.topicTag === "string" ? raw.topicTag.trim().replace(/^#/, "") : "";
  const linkPreviewMode = ["default", "remove_preview", "move_links_to_comment"].includes(String(raw.linkPreviewMode))
    ? String(raw.linkPreviewMode)
    : undefined;
  const spoilerMode = ["none", "all_text"].includes(String(raw.spoilerMode)) ? String(raw.spoilerMode) : undefined;
  const replyControl = ["everyone", "accounts_you_follow", "mentioned_only"].includes(String(raw.replyControl)) ? String(raw.replyControl) : undefined;
  const normalized = {
    ...(topicTag ? { topicTag } : {}),
    ...(linkPreviewMode ? { linkPreviewMode } : {}),
    ...(spoilerMode ? { spoilerMode } : {}),
    ...(replyControl ? { replyControl } : {}),
    ...(typeof raw.spoilerMedia === "boolean" ? { spoilerMedia: raw.spoilerMedia } : {}),
    ...(typeof raw.ghostPost === "boolean" ? { ghostPost: raw.ghostPost } : {}),
    ...(typeof raw.enableReplyApprovals === "boolean" ? { enableReplyApprovals: raw.enableReplyApprovals } : {})
  };
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function mediaAssetCreatesFromPaths(mediaPaths: string[], source: string, postType?: string) {
  return mediaPaths.map((mediaPath, index) => {
    const isRemote = /^https?:\/\//i.test(mediaPath);
    return {
      type: inferMediaType(mediaPath),
      mimeType: inferMimeType(mediaPath),
      ...(isRemote ? { sourceUrl: mediaPath } : { localPath: mediaPath }),
      metadata: { source, sortOrder: index, ...(postType ? { postType } : {}) }
    };
  });
}

async function syncContentMediaFromPaths(contentId: string, mediaPaths: string[], source: string, postType?: string) {
  await prisma.mediaAsset.deleteMany({ where: { contentId } });
  if (mediaPaths.length === 0) return;
  await prisma.mediaAsset.createMany({
    data: mediaAssetCreatesFromPaths(mediaPaths, source, postType).map((media) => ({
      contentId,
      ...media,
      metadata: media.metadata as Prisma.InputJsonValue
    }))
  });
}

async function removeScheduleQueueJobs(app: FastifyInstance, scheduleId: string) {
  const queue = app.workerCore.queues.schedule;
  const jobs = await queue.getJobs(["delayed", "waiting", "paused"], 0, -1).catch(() => []);
  await Promise.all(
    jobs
      .filter((job) => job.name === "schedule.release" && (job.data as AnyBody | undefined)?.scheduleId === scheduleId)
      .map((job) => job.remove().catch(() => undefined))
  );
}

async function syncContentScheduleSummary(contentId: string) {
  const schedules = await prisma.schedule.findMany({
    where: { contentId, status: "scheduled" },
    orderBy: { scheduledAt: "asc" }
  });

  if (schedules.length === 0) {
    await prisma.content.updateMany({
      where: { id: contentId, status: "scheduled" },
      data: { status: "ready_to_publish", scheduledAt: null, scheduledTargets: [] as Prisma.InputJsonValue }
    });
    return;
  }

  await prisma.content.update({
    where: { id: contentId },
    data: {
      status: "scheduled",
      scheduledAt: schedules[0].scheduledAt,
      scheduledTargets: uniqueStrings(schedules.map((schedule) => schedule.targetId)) as Prisma.InputJsonValue
    }
  });
}

async function scheduleContentForTargets(app: FastifyInstance, contentId: string, targetIds: string[], scheduledAt: Date) {
  const schedules = await Promise.all(
    uniqueStrings(targetIds).map((targetId) =>
      prisma.schedule.upsert({
        where: {
          contentId_targetId_scheduledAt: {
            contentId,
            targetId,
            scheduledAt
          }
        },
        create: { contentId, targetId, scheduledAt },
        update: { status: "scheduled" }
      })
    )
  );

  await syncContentScheduleSummary(contentId);
  await Promise.all(
    schedules.map(async (schedule) => {
      await removeScheduleQueueJobs(app, schedule.id);
      await app.workerCore.scheduleRelease(schedule.id, schedule.scheduledAt);
    })
  );
  return schedules;
}

async function replaceContentSchedules(app: FastifyInstance, contentId: string, targetIds: string[], scheduledAt: Date) {
  const existing = await prisma.schedule.findMany({ where: { contentId, status: "scheduled" } });
  await Promise.all(existing.map((schedule) => removeScheduleQueueJobs(app, schedule.id)));
  await prisma.schedule.deleteMany({ where: { contentId, status: "scheduled" } });
  return scheduleContentForTargets(app, contentId, targetIds, scheduledAt);
}

async function resolvePublishTargetIds(content: { id: string; platform: string; scheduledTargets: unknown }) {
  const scheduledTargets = Array.isArray(content.scheduledTargets)
    ? uniqueStrings((content.scheduledTargets as unknown[]).map(String))
    : [];
  if (scheduledTargets.length > 0) return scheduledTargets;

  const previousAttempts = await prisma.publishAttempt.findMany({
    where: { contentId: content.id },
    select: { targetId: true },
    distinct: ["targetId"]
  });
  const previousTargetIds = uniqueStrings(previousAttempts.map((attempt) => attempt.targetId));
  if (previousTargetIds.length > 0) return previousTargetIds;

  const contentPlatform = content.platform && content.platform !== "manual" ? content.platform : "facebook";
  const platformTargets = await prisma.targetAccount.findMany({
    where: { platform: contentPlatform, isActive: true, health: { not: "paused" } },
    select: { id: true }
  });
  return uniqueStrings(platformTargets.map((target) => target.id));
}

type PublishTargetJob = { targetId: string; targetChannelId?: string };

function contentPublishText(content: { finalText?: string | null; draftText?: string | null; originalText: string }) {
  return content.finalText ?? content.draftText ?? content.originalText;
}

function findUnconvertedPublishLinks(content: {
  finalText?: string | null;
  draftText?: string | null;
  originalText: string;
  links?: Array<{ originalUrl: string; convertedUrl?: string | null; status: string }>;
}) {
  const text = contentPublishText(content);
  return (content.links ?? []).filter((link) => {
    if (!text.includes(link.originalUrl)) return false;
    return !link.convertedUrl || ["detected", "failed", "unsupported"].includes(link.status);
  });
}

async function resolvePublishJobs(targetIds: string[]): Promise<PublishTargetJob[]> {
  const requestedTargetIds = uniqueStrings(targetIds);
  if (requestedTargetIds.length === 0) return [];

  const targetChannels = await prisma.platformChannel.findMany({
    where: { id: { in: requestedTargetIds }, isTarget: true, isActive: true },
    select: { id: true, accountId: true }
  });
  const channelById = new Map(targetChannels.map((channel) => [channel.id, channel]));
  const channelIds = new Set(targetChannels.map((channel) => channel.id));
  const accountIds = requestedTargetIds.filter((id) => !channelIds.has(id));
  const targetAccounts = accountIds.length > 0
    ? await prisma.targetAccount.findMany({
        where: { id: { in: accountIds }, isActive: true, health: { not: "paused" } },
        select: { id: true }
      })
    : [];

  const jobs = [
    ...requestedTargetIds.flatMap((id) => {
      const channel = channelById.get(id);
      return channel ? [{ targetId: channel.accountId, targetChannelId: channel.id }] : [];
    }),
    ...targetAccounts.map((target) => ({ targetId: target.id, targetChannelId: undefined as string | undefined }))
  ];
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = `${job.targetId}:${job.targetChannelId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function enqueueContentContinuation(
  app: FastifyInstance,
  content: { id: string; status: string; platform: string; scheduledAt: Date | null; scheduledTargets: unknown },
  action: "retry" | "resume"
) {
  const targetIds = await resolvePublishTargetIds(content);
  const publishJobs = await resolvePublishJobs(targetIds);
  if (publishJobs.length === 0) {
    await app.workerCore.processContent(content.id);
    return { processed: true, queuedPublishes: 0, queuedSchedules: 0 };
  }

  if (action === "resume" && content.scheduledAt && content.scheduledAt.getTime() > Date.now()) {
    const schedules = await scheduleContentForTargets(app, content.id, uniqueStrings(publishJobs.map((job) => job.targetId)), content.scheduledAt);
    return { processed: false, queuedPublishes: 0, queuedSchedules: schedules.length };
  }

  await Promise.all(publishJobs.map((job) => app.workerCore.publishNow(content.id, job.targetId, "admin", job.targetChannelId)));
  return { processed: false, queuedPublishes: publishJobs.length, queuedSchedules: 0 };
}

function registerContentRoutes(app: FastifyInstance) {
  app.post("/contents/manual", async (request) => {
    const body = request.body as AnyBody;
    const originalText = String(body.originalText ?? body.text ?? "").trim();
    if (!originalText) {
      return { statusCode: 400, ...fail("CONTENT_REQUIRED", "Cần nhập nội dung bài viết.") };
    }

    const targetIds = normalizePathList(body.targetIds);
    const mediaPaths = normalizePathList(body.mediaPaths);
    const commentMedia = normalizePathList(body.commentMedia);
    const postType = body.type ? String(body.type) : "feed";
    const threads = normalizeThreadsMetadata(body.threads);
    const scheduledAt = parseDateInput(body.scheduledAt);
    if (body.scheduledAt && !scheduledAt) {
      return { statusCode: 400, ...fail("INVALID_SCHEDULE", "Thời gian hẹn đăng không hợp lệ.") };
    }

    const manualStatus = body.status ? String(body.status) : (scheduledAt ? "scheduled" : "ready_to_publish");
    if (manualStatus === "scheduled" && targetIds.length === 0) {
      return { statusCode: 400, ...fail("TARGET_REQUIRED", "Cần chọn ít nhất một tài khoản đăng.") };
    }
    if (manualStatus === "scheduled" && targetIds.length > 0 && !scheduledAt) {
      return { statusCode: 400, ...fail("INVALID_SCHEDULE", "Cần chọn thời gian hẹn đăng.") };
    }

    const content = await prisma.content.create({
      data: {
        code: `MAN-${Date.now()}`,
        platform: String(body.platform ?? "manual"),
        originalText,
        draftText: body.draftText ? String(body.draftText) : undefined,
        finalText: body.finalText ? String(body.finalText) : undefined,
        status: manualStatus,
        scheduledAt,
        scheduledTargets: targetIds,
        metadata: {
          type: postType,
          comment: body.comment ? String(body.comment) : undefined,
          commentMedia,
          mediaPaths,
          ...(threads ? { threads } : {}),
          fbPostId: body.fbPostId ? String(body.fbPostId) : undefined,
          manualMode: body.mode ? String(body.mode) : undefined
        },
        ...(mediaPaths.length > 0 ? { media: { create: mediaAssetCreatesFromPaths(mediaPaths, "manual", postType) } } : {})
      }
    });

    if (manualStatus === "scheduled" && scheduledAt && targetIds.length > 0) {
      await scheduleContentForTargets(app, content.id, targetIds, scheduledAt);
    }

    return ok({ content });
  });

  app.get("/contents", async (request) => {
    const query = request.query as AnyBody;
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const where = buildContentWhere(query);
    const sortBy = ["createdAt", "updatedAt", "scheduledAt", "platform", "status", "code"].includes(String(query.sortBy))
      ? String(query.sortBy)
      : "createdAt";
    const sortOrder = String(query.sortOrder ?? "desc") === "asc" ? "asc" : "desc";
    const [total, contents] = await Promise.all([
      prisma.content.count({ where }),
      prisma.content.findMany({
        where,
        include: {
          links: true,
          media: true,
          source: true,
          publishAttempts: {
            orderBy: { createdAt: "desc" },
            take: 5,
            include: { target: { select: { id: true, name: true, platform: true } } }
          },
          commentQueues: {
            orderBy: { createdAt: "desc" },
            take: 5,
            include: { target: { select: { id: true, name: true, platform: true } } }
          }
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit
      })
    ]);
    return ok({ contents }, buildPagination(page, limit, total));
  });

  app.post("/contents/bulk-action", async (request, reply) => {
    const body = request.body as AnyBody;
    const action = String(body.action ?? "");
    const allowedActions = new Set(["pause", "resume", "cancel", "retry", "move_to_saved", "move_to_trash", "restore", "delete_forever", "export"]);
    if (!allowedActions.has(action)) return reply.code(400).send(fail("BAD_ACTION", "Hành động hàng loạt không hợp lệ."));

    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    const filter = body.filter && typeof body.filter === "object" ? body.filter as AnyBody : {};
    const where: Prisma.ContentWhereInput = ids.length > 0
      ? { OR: [{ id: { in: ids } }, { code: { in: ids } }] }
      : buildContentWhere(filter);
    const shouldQueueContinuation = action === "retry" || action === "resume";
    const contentsToQueue = shouldQueueContinuation
      ? await prisma.content.findMany({
          where,
          select: { id: true, status: true, platform: true, scheduledAt: true, scheduledTargets: true }
        })
      : [];

    if (action === "export") {
      const contents = await prisma.content.findMany({ where, orderBy: { updatedAt: "desc" }, take: 10_000 });
      return ok({ affected: contents.length, contents });
    }

    if (action === "delete_forever") {
      const deleted = await prisma.content.deleteMany({ where });
      return ok({ affected: deleted.count });
    }

    const now = new Date();
    const reason = body.reason ? String(body.reason) : undefined;
    const dataByAction: Record<string, Prisma.ContentUpdateManyMutationInput> = {
      pause: { status: "paused" },
      resume: { status: "ready_to_publish" },
      cancel: { status: "trashed", deletedAt: now, cancelledAt: now },
      retry: { status: "ready_to_publish", lastError: null, retryCount: { increment: 1 } },
      move_to_saved: { status: "saved", savedReason: reason ?? "Chuyển vào Kho lưu trữ", savedSource: "bulk_action" },
      move_to_trash: { status: "trashed", deletedAt: now },
      restore: { status: "draft", deletedAt: null, cancelledAt: null, cancelReason: null }
    };

    const updated = await prisma.content.updateMany({ where, data: dataByAction[action] });
    const queued = [];
    if (shouldQueueContinuation) {
      for (const content of contentsToQueue) {
        queued.push(await enqueueContentContinuation(app, content, action as "retry" | "resume"));
      }
    }
    return ok({
      affected: updated.count,
      queuedPublishes: queued.reduce((total, item) => total + item.queuedPublishes, 0),
      queuedSchedules: queued.reduce((total, item) => total + item.queuedSchedules, 0),
      queuedProcesses: queued.filter((item) => item.processed).length
    });
  });

  app.post("/contents/bulk-import", async (request, reply) => {
    const payload = await readConvertToolPayload(request);
    const mapping = parseJsonObject(payload.fields.mapping, {
      caption: "caption",
      mediaPaths: "media paths",
      comments: "comments",
      commentMediaPaths: "comment media paths",
      scheduleTime: "schedule time",
      postType: "post type",
      threadsTopic: "threads topic",
      threadsLinkPreviewMode: "threads link preview mode",
      threadsSpoilerMode: "threads spoiler mode",
      threadsSpoilerMedia: "threads spoiler media"
    });
    const targetIds = parseJsonArray(payload.fields.targetIds);
    if (targetIds.length === 0) return reply.code(400).send(fail("TARGET_REQUIRED", "Cần chọn ít nhất một tài khoản đăng."));
    if (payload.rows.length === 0) return reply.code(400).send(fail("IMPORT_EMPTY", "File import không có dòng dữ liệu."));

    const scheduleMode = String(payload.fields.scheduleMode ?? "now");
    const fixedScheduledAt = parseDateInput(payload.fields.scheduledAt);
    if (payload.fields.scheduledAt && !fixedScheduledAt) {
      return reply.code(400).send(fail("INVALID_SCHEDULE", "Thời gian hẹn đăng không hợp lệ."));
    }
    const created = [];
    const failed: Array<{ row: number; error: string }> = [];

    for (const [index, row] of payload.rows.entries()) {
      try {
        const caption = getRowValue(row, [String(mapping.caption ?? "caption"), "caption", "nội dung", "noi dung"]);
        if (!caption) throw new Error("Thiếu caption/nội dung.");
        const rowScheduledAt = getRowValue(row, [String(mapping.scheduleTime ?? "schedule time"), "schedule time", "scheduledAt"]);
        const shouldSchedule = scheduleMode !== "now";
        const rowScheduleDate = parseDateInput(rowScheduledAt);
        if (rowScheduledAt && !rowScheduleDate) throw new Error("Thời gian hẹn đăng không hợp lệ.");
        const scheduledAt = rowScheduleDate ?? fixedScheduledAt;
        if (shouldSchedule && !scheduledAt) throw new Error("Thiếu thời gian hẹn đăng.");
        const mediaPaths = getRowValue(row, [String(mapping.mediaPaths ?? "media paths"), "media paths", "media", "mediaPaths"]).split(/[,\n;]/).map((item) => item.trim()).filter(Boolean);
        const comment = getRowValue(row, [String(mapping.comments ?? "comments"), "comments", "comment"]);
        const commentMedia = getRowValue(row, [String(mapping.commentMediaPaths ?? "comment media paths"), "comment media paths", "commentMedia"]).split(/[,\n;]/).map((item) => item.trim()).filter(Boolean);
        const postType = getRowValue(row, [String(mapping.postType ?? "post type"), "post type", "type"]) || "feed";
        const threadsSpoilerMedia = getRowValue(row, [String(mapping.threadsSpoilerMedia ?? "threads spoiler media"), "threads spoiler media", "spoilerMedia"]);
        const threads = normalizeThreadsMetadata({
          topicTag: getRowValue(row, [String(mapping.threadsTopic ?? "threads topic"), "threads topic", "topic", "topicTag"]),
          linkPreviewMode: getRowValue(row, [String(mapping.threadsLinkPreviewMode ?? "threads link preview mode"), "threads link preview mode", "linkPreviewMode"]),
          spoilerMode: getRowValue(row, [String(mapping.threadsSpoilerMode ?? "threads spoiler mode"), "threads spoiler mode", "spoilerMode"]),
          ...(threadsSpoilerMedia ? { spoilerMedia: parseBooleanInput(threadsSpoilerMedia) } : {})
        });

        const content = await prisma.content.create({
          data: {
            code: `IMP-${Date.now()}-${index}-${randomUUID().slice(0, 4)}`,
            platform: String(payload.fields.platform ?? "manual"),
            originalText: caption,
            status: shouldSchedule ? "scheduled" : "ready_to_publish",
            scheduledAt: shouldSchedule ? scheduledAt : undefined,
            scheduledTargets: targetIds,
            metadata: {
              type: postType,
              mediaPaths,
              comment,
              commentMedia,
              ...(threads ? { threads } : {}),
              bulkImport: true
            },
            ...(mediaPaths.length > 0 ? { media: { create: mediaAssetCreatesFromPaths(mediaPaths, "bulk_import", postType) } } : {})
          }
        });
        if (shouldSchedule && scheduledAt) {
          await scheduleContentForTargets(app, content.id, targetIds, scheduledAt);
        }
        created.push(content);
      } catch (error) {
        failed.push({ row: index + 1, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return ok({ created, failed, total: payload.rows.length });
  });

  app.get("/contents/:code", async (request, reply) => {
    const { code } = request.params as { code: string };
    const content = await prisma.content.findUnique({
      where: { code },
      include: {
        links: true,
        media: true,
        publishAttempts: { include: { target: { select: { id: true, name: true, platform: true } } } },
        commentQueues: {
          orderBy: { createdAt: "desc" },
          include: { target: { select: { id: true, name: true, platform: true } } }
        },
        source: true
      }
    });
    if (!content) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy nội dung."));
    return ok({ content });
  });

  app.get("/contents/:code/preview", async (request, reply) => {
    const { code } = request.params as { code: string };
    const content = await prisma.content.findUnique({ where: { code } });
    if (!content) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy nội dung."));
    return ok({ text: content.finalText ?? content.draftText ?? content.originalText });
  });

  app.put("/contents/:code/edit", async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = request.body as AnyBody;
    const current = await prisma.content.findUnique({ where: { code } });
    if (!current) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy nội dung."));

    const baseMetadata = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
      ? (current.metadata as Record<string, unknown>)
      : {};
    const nextMetadata = {
      ...baseMetadata,
      ...(body.type !== undefined ? { type: String(body.type) } : {}),
      ...(body.comment !== undefined ? { comment: String(body.comment) } : {}),
      ...(body.mediaPaths !== undefined ? { mediaPaths: normalizePathList(body.mediaPaths) } : {}),
      ...(body.threads !== undefined ? { threads: normalizeThreadsMetadata(body.threads) ?? {} } : {})
    };
    const nextTargetIds = Array.isArray(body.targetIds) ? body.targetIds.map(String) : current.scheduledTargets;
    const nextPostType = String(nextMetadata.type ?? "feed");
    const nextMediaPaths = normalizePathList((nextMetadata as AnyBody).mediaPaths);

    const content = await prisma.content.update({
      where: { code },
      data: {
        ...(body.draftText !== undefined ? { draftText: String(body.draftText) } : {}),
        scheduledTargets: (nextTargetIds ?? undefined) as Prisma.InputJsonValue | undefined,
        metadata: nextMetadata as Prisma.InputJsonValue
      }
    });
    if (body.mediaPaths !== undefined) {
      await syncContentMediaFromPaths(current.id, nextMediaPaths, "content_edit", nextPostType);
    }
    return ok({ content });
  });

  app.put("/contents/:code/draft", async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = request.body as AnyBody;
    const content = await prisma.content.update({ where: { code }, data: { draftText: String(body.draftText ?? "") } }).catch(() => null);
    if (!content) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy nội dung."));
    await app.workerCore.processContent(content.id);
    return ok({ content });
  });

  app.post("/contents/:code/links", async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = request.body as AnyBody;
    const content = await prisma.content.findUnique({ where: { code } });
    if (!content) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy nội dung."));
    const links = Array.isArray(body.links) ? body.links : [];
    await Promise.all(
      links.map((link: AnyBody) =>
        prisma.contentLink.upsert({
          where: { contentId_originalUrl: { contentId: content.id, originalUrl: String(link.originalUrl) } },
          update: { convertedUrl: link.convertedUrl, status: link.convertedUrl ? "converted" : "detected" },
          create: { contentId: content.id, originalUrl: String(link.originalUrl), convertedUrl: link.convertedUrl, network: link.network ?? "unknown", status: link.convertedUrl ? "converted" : "detected" }
        })
      )
    );
    await app.workerCore.processContent(content.id);
    return ok({ success: true });
  });

  app.get("/content-links", async (request) => {
    const query = request.query as AnyBody;
    const statuses = String(query.status ?? "failed,detected,unsupported")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const limit = Math.min(Math.max(Number(query.limit ?? 100), 1), 200);
    const links = await prisma.contentLink.findMany({
      where: statuses.length > 0 ? { status: { in: statuses } } : {},
      include: { content: true },
      orderBy: { updatedAt: "desc" },
      take: limit
    });
    return ok({ links });
  });

  app.put("/content-links/:id/manual-convert", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    const convertedUrl = String(body.convertedUrl ?? "").trim();
    if (!convertedUrl) return reply.code(400).send(fail("BAD_REQUEST", "Cần nhập link affiliate đã convert."));

    const link = await prisma.contentLink.update({
      where: { id },
      data: { convertedUrl, status: "converted", error: null }
    }).catch(() => null);
    if (!link) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy link cần xử lý."));

    await prisma.content.update({
      where: { id: link.contentId },
      data: {
        status: "discovered",
        savedReason: null,
        savedSource: null,
        lastError: null
      }
    });
    await app.workerCore.processContent(link.contentId);
    return ok({ link, queued: true });
  });

  app.post("/contents/:code/manual-link", async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = request.body as AnyBody;
    const current = await prisma.content.findUnique({ where: { code } });
    if (!current) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy nội dung."));

    const baseMetadata = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
      ? (current.metadata as Record<string, unknown>)
      : {};
    const nextMetadata = {
      ...baseMetadata,
      ...(body.fbPostId ? { fbPostId: String(body.fbPostId) } : {}),
      ...(body.manualMode ? { manualMode: String(body.manualMode) } : {})
    };
    const nextTargetIds = Array.isArray(body.targetIds) ? body.targetIds.map(String) : current.scheduledTargets;
    const nextScheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : current.scheduledAt;

    const content = await prisma.content.update({
      where: { code },
      data: {
        status: body.status ? String(body.status) : current.status,
        scheduledTargets: (nextTargetIds ?? undefined) as Prisma.InputJsonValue | undefined,
        scheduledAt: nextScheduledAt,
        metadata: nextMetadata as Prisma.InputJsonValue
      }
    });
    return ok({ content });
  });

  app.post("/contents/:code/skip", (request) => updateContentStatus(request, "skipped"));
  app.post("/contents/:code/reject", (request) => updateContentStatus(request, "rejected"));
  app.post("/contents/:code/retry", async (request, reply) => {
    const { code } = request.params as { code: string };
    const content = await prisma.content.findUnique({ where: { code } });
    if (!content) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy nội dung."));
    await prisma.content.update({
      where: { id: content.id },
      data: {
        status: "discovered",
        finalText: null,
        lastError: null,
        savedReason: null,
        savedSource: null,
        retryCount: { increment: 1 }
      }
    });
    await app.workerCore.processContent(content.id);
    return ok({ queued: true, processed: true, queuedPublishes: 0, message: "Đã chạy lại xử lý; content-process sẽ convert link trước khi đăng." });
  });
  app.post("/contents/:code/publish", async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = request.body as AnyBody;
    const content = await prisma.content.findUnique({ where: { code }, include: { links: true } });
    if (!content) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy nội dung."));
    const unconvertedLinks = findUnconvertedPublishLinks(content);
    if (unconvertedLinks.length > 0) {
      return reply.code(409).send(fail("LINK_NOT_CONVERTED", "Vui lòng convert link trước khi đăng. Nội dung hiện vẫn còn link gốc.", {
        links: unconvertedLinks.map((link) => ({ originalUrl: link.originalUrl, status: link.status }))
      }));
    }

    // Resolve targets: body.targetIds > content.scheduledTargets > active PlatformChannel targets.
    // Routing by platform:
    //   facebook  → publishNow (routes to facebook adapter via publish queue)
    //   instagram → publishNow (routes to instagram adapter via publish queue)
    //   threads   → publishNow (routes to threads adapter via publish queue)
    //   default   → publishNow (routes to whichever adapter matches the target)
    // Note: fb-post queue is only for the FbCampaign/FbPostTarget system and requires a different data model.
    let requestedTargetIds: string[] = [];
    if (Array.isArray(body.targetIds) && body.targetIds.length > 0) {
      requestedTargetIds = body.targetIds.map(String);
    } else if (Array.isArray(content.scheduledTargets) && (content.scheduledTargets as unknown[]).length > 0) {
      requestedTargetIds = (content.scheduledTargets as unknown[]).map(String);
    } else {
      const activeTargetChannels = await prisma.platformChannel.findMany({
        where: { isTarget: true, isActive: true },
        select: { id: true }
      });
      requestedTargetIds = activeTargetChannels.map((target) => target.id);
    }

    if (requestedTargetIds.length === 0) {
      return reply.code(400).send(fail("TARGET_REQUIRED", "Chưa có kênh đích nào đang bật."));
    }

    const jobs = await resolvePublishJobs(requestedTargetIds);

    if (jobs.length === 0) {
      return reply.code(400).send(fail("TARGET_REQUIRED", "Không có kênh đích nào nhận nội dung này."));
    }

    await Promise.all(jobs.map((job) => app.workerCore.publishNow(content.id, job.targetId, "admin", job.targetChannelId)));
    return ok({ queued: true, targetCount: jobs.length, platform: content.platform });
  });
  app.post("/contents/:code/schedule", async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = request.body as AnyBody;
    const content = await prisma.content.findUnique({ where: { code } });
    if (!content) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy nội dung."));
    const scheduledAt = parseDateInput(body.scheduledAt);
    if (!scheduledAt) return reply.code(400).send(fail("INVALID_SCHEDULE", "Thời gian hẹn đăng không hợp lệ."));
    const targetIds = normalizePathList(body.targetIds);
    if (targetIds.length === 0) return reply.code(400).send(fail("TARGET_REQUIRED", "Cần chọn ít nhất một tài khoản đăng."));
    const schedules = await replaceContentSchedules(app, content.id, targetIds, scheduledAt);
    return ok({ schedules });
  });
  app.delete("/contents/:code", async (request) => {
    const { code } = request.params as { code: string };
    await prisma.content.delete({ where: { code } });
    return ok({ success: true });
  });
}

async function updateContentStatus(request: FastifyRequest, status: string) {
  const { code } = request.params as { code: string };
  const body = request.body as AnyBody;
  const content = await prisma.content.update({
    where: { code },
    data: { status, metadata: body.reason ? { reason: body.reason } : undefined }
  });
  return ok({ content });
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB

function validateUploadedFile(mimetype: string, bytesRead: number): string | null {
  const isImage = ALLOWED_IMAGE_TYPES.has(mimetype);
  const isVideo = ALLOWED_VIDEO_TYPES.has(mimetype);
  if (!isImage && !isVideo) {
    return `Loại file không hỗ trợ: ${mimetype}. Chỉ chấp nhận jpg, png, gif, webp, mp4, mov.`;
  }
  if (isImage && bytesRead > MAX_IMAGE_BYTES) {
    return `Ảnh quá lớn (tối đa 10 MB, hiện tại ${(bytesRead / 1_048_576).toFixed(1)} MB).`;
  }
  if (isVideo && bytesRead > MAX_VIDEO_BYTES) {
    return `Video quá lớn (tối đa 500 MB, hiện tại ${(bytesRead / 1_048_576).toFixed(1)} MB).`;
  }
  return null;
}

async function saveUploadedFile(part: Awaited<ReturnType<FastifyRequest["file"]>>) {
  if (!part) return null;
  const now = new Date();
  const dir = path.resolve(config.MEDIA_UPLOAD_ROOT, `${now.getFullYear()}`, `${String(now.getMonth() + 1).padStart(2, "0")}`, `${String(now.getDate()).padStart(2, "0")}`);
  mkdirSync(dir, { recursive: true });
  const sanitized = part.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${Date.now()}-${randomUUID()}-${sanitized}`;
  const fullPath = path.join(dir, filename);
  await pipeline(part.file, createWriteStream(fullPath));
  return {
    filename: part.filename,
    localPath: fullPath,
    mimeType: part.mimetype,
    fileSize: part.file.bytesRead
  };
}

function getExportDir() {
  const dir = path.resolve(config.MEDIA_UPLOAD_ROOT, "exports");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function checksumText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // Plain comma-separated values are accepted for multipart forms.
  }
  return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseJsonObject(value: unknown, fallback: Record<string, unknown> = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : fallback;
  } catch {
    return fallback;
  }
}

function parseBooleanInput(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string") return !["false", "0", "no", "off"].includes(value.trim().toLowerCase());
  return Boolean(value);
}

function normalizeSourcePlatform(value: unknown) {
  const platform = String(value ?? "").trim().toLowerCase();
  return platform === "website" ? "web" : platform;
}

function crawlPlatformRequiresAccount(platform: string) {
  return platform !== "web";
}

function readCrawlAccountId(body: AnyBody) {
  const accountId = body.accountId ?? body.crawlAccountId ?? body.loginAccountId;
  return accountId ? String(accountId).trim() : "";
}

async function resolveCrawlAccountId(sourcePlatform: string, body: AnyBody): Promise<{ accountId: string | null } | { error: { statusCode: number; code: string; message: string } }> {
  if (!crawlPlatformRequiresAccount(sourcePlatform)) return { accountId: null };

  const explicitAccountId = readCrawlAccountId(body);
  if (explicitAccountId) {
    const account = await prisma.targetAccount.findUnique({ where: { id: explicitAccountId } });
    if (!account) {
      return { error: { statusCode: 404, code: "ACCOUNT_NOT_FOUND", message: "Không tìm thấy tài khoản dùng để crawl." } };
    }
    if (account.platform !== sourcePlatform) {
      return { error: { statusCode: 400, code: "ACCOUNT_PLATFORM_MISMATCH", message: `Tài khoản crawl phải cùng nền tảng ${sourcePlatform}.` } };
    }
    if (!account.isActive || ["paused", "failed"].includes(account.health)) {
      return { error: { statusCode: 400, code: "ACCOUNT_NOT_READY", message: "Tài khoản dùng để crawl đang tắt, lỗi hoặc bị tạm dừng." } };
    }
    return { accountId: account.id };
  }

  const candidates = await prisma.targetAccount.findMany({
    where: { platform: sourcePlatform, isActive: true },
    orderBy: { updatedAt: "desc" }
  });
  const account = candidates.find((item) => !["paused", "failed"].includes(item.health));
  if (!account) {
    return {
      error: {
        statusCode: 400,
        code: "NO_CRAWL_ACCOUNT",
        message: `Cần có ít nhất một tài khoản ${sourcePlatform} đang hoạt động để crawl nguồn này.`
      }
    };
  }
  return { accountId: account.id };
}

function buildTargetAccountPayload(body: AnyBody, partial = false): Prisma.TargetAccountUncheckedCreateInput | Prisma.TargetAccountUncheckedUpdateInput {
  const data: AnyBody = {};
  const assign = (key: string, value: unknown) => {
    if (!partial || value !== undefined) data[key] = value;
  };
  const requestedPlatform = String(body.platform ?? "").trim();

  assign("platform", body.platform !== undefined ? String(body.platform).trim() : undefined);
  assign("name", body.name !== undefined ? String(body.name).trim() : undefined);
  assign("handle", body.handle !== undefined ? String(body.handle).trim() || null : undefined);
  assign("isActive", body.isActive !== undefined ? parseBooleanInput(body.isActive, true) : undefined);
  assign("health", body.health !== undefined ? String(body.health).trim() || "unknown" : undefined);
  assign("credentials", body.credentials !== undefined ? parseJsonObject(body.credentials) : undefined);
  assign("config", body.config !== undefined ? parseJsonObject(body.config) : undefined);

  if (!partial) {
    data.platform = String(body.platform ?? "facebook").trim();
    data.name = String(body.name ?? "").trim();
    data.handle = body.handle !== undefined ? String(body.handle).trim() || null : null;
    data.isActive = parseBooleanInput(body.isActive, true);
    data.health = String(body.health ?? "unknown").trim() || "unknown";
    data.credentials = parseJsonObject(body.credentials);
    data.config = parseJsonObject(body.config);
  }

  const resolvedPlatform = String(data.platform ?? requestedPlatform).trim();
  if (["facebook", "instagram", "threads", "x"].includes(resolvedPlatform)) {
    if (!partial || body.credentials !== undefined) data.credentials = {};
    if (!partial || body.config !== undefined) data.config = {};
  }

  return data;
}

function omitSessionPathFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitSessionPathFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "authPath" && key !== "sessionDir" && key !== "cookiePath")
      .map(([key, item]) => [key, omitSessionPathFields(item)])
  );
}

function classifyLinkNetwork(url: string, detectedNetwork?: string) {
  const normalized = url.toLowerCase();
  if (normalized.includes("shopee.")) return "shopee";
  if (normalized.includes("lazada.")) return "lazada";
  if (normalized.includes("google.") || normalized.includes("forms.gle") || normalized.includes("drive.google.")) return "google";
  return detectedNetwork && detectedNetwork !== "unknown" ? detectedNetwork : "unknown";
}

function collectLinks(text: string) {
  const links = new Map<string, { originalUrl: string; network: string }>();
  const detected = detectLinks(text) as Array<{ url?: string; originalUrl?: string; network?: string }>;
  for (const item of detected) {
    const originalUrl = String(item.url ?? item.originalUrl ?? "").trim();
    if (!originalUrl) continue;
    links.set(originalUrl, { originalUrl, network: classifyLinkNetwork(originalUrl, item.network) });
  }

  const genericMatches = text.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  for (const rawUrl of genericMatches) {
    const originalUrl = rawUrl.replace(/[),.;!?]+$/, "");
    if (!links.has(originalUrl)) links.set(originalUrl, { originalUrl, network: classifyLinkNetwork(originalUrl) });
  }

  return Array.from(links.values()).map((link) => ({
    ...link,
    action: link.network === "shopee" || link.network === "lazada" ? "convert" as const : "saved_for_review" as const,
    reason: link.network === "shopee" || link.network === "lazada" ? undefined : "Link chưa hỗ trợ convert tự động"
  }));
}

function buildAutoRulePayload(body: AnyBody, partial = false): Prisma.AutoConversionRuleUncheckedCreateInput | Prisma.AutoConversionRuleUncheckedUpdateInput {
  const data: AnyBody = {};
  const assign = (key: string, value: unknown) => {
    if (!partial || value !== undefined) data[key] = value;
  };

  assign("name", body.name !== undefined ? String(body.name) : undefined);
  assign("description", body.description !== undefined ? String(body.description) : undefined);
  assign("enabled", body.enabled !== undefined ? Boolean(body.enabled) : undefined);
  assign("sourcePlatform", body.sourcePlatform !== undefined ? String(body.sourcePlatform) : undefined);
  assign("sourceAccountId", body.sourceAccountId !== undefined ? null : undefined);
  assign("sourceRef", body.sourceRef !== undefined ? String(body.sourceRef) : undefined);
  assign("triggerMode", body.triggerMode !== undefined ? String(body.triggerMode) : undefined);
  assign("pollingIntervalMinutes", body.pollingIntervalMinutes !== undefined ? Number(body.pollingIntervalMinutes) : undefined);
  assign("targetAccountIds", parseJsonArray(body.targetAccountIds));
  assign("postType", body.postType !== undefined ? String(body.postType) : undefined);
  assign("includeFirstComment", body.includeFirstComment !== undefined ? Boolean(body.includeFirstComment) : undefined);
  assign("commentMode", body.commentMode !== undefined ? String(body.commentMode) : undefined);
  assign("customComment", body.customComment !== undefined ? String(body.customComment) : undefined);
  assign("linkRules", parseJsonObject(body.linkRules));
  assign("contentRules", parseJsonObject(body.contentRules));
  assign("mediaRules", parseJsonObject(body.mediaRules));
  assign("scheduleRules", parseJsonObject(body.scheduleRules));
  assign("aiConfigId", body.aiConfigId ? String(body.aiConfigId) : null);
  assign("cloudinaryKeyIds", parseJsonArray(body.cloudinaryKeyIds));

  if (!partial) {
    data.name = String(body.name ?? "").trim();
    data.sourcePlatform = String(body.sourcePlatform ?? "facebook");
    data.sourceRef = String(body.sourceRef ?? "").trim();
    data.enabled = body.enabled === undefined ? true : Boolean(body.enabled);
    data.triggerMode = String(body.triggerMode ?? "polling");
    data.pollingIntervalMinutes = Number(body.pollingIntervalMinutes ?? 15);
    data.postType = String(body.postType ?? "feed");
    data.includeFirstComment = Boolean(body.includeFirstComment ?? false);
    data.commentMode = String(body.commentMode ?? "none");
  }

  return data;
}

function registerAutoConversionRoutes(app: FastifyInstance) {
  app.get("/auto-conversion/rules", async (request) => {
    const query = request.query as AnyBody;
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const where: Prisma.AutoConversionRuleWhereInput = {};

    if (query.enabled !== undefined && String(query.enabled) !== "all") where.enabled = String(query.enabled) === "true";
    if (query.sourcePlatform && String(query.sourcePlatform) !== "all") where.sourcePlatform = String(query.sourcePlatform);
    const keyword = String(query.keyword ?? "").trim();
    if (keyword) {
      const contains = { contains: keyword, mode: "insensitive" as const };
      where.OR = [{ name: contains }, { description: contains }, { sourceRef: contains }, { sourcePlatform: contains }];
    }

    const [total, rules] = await Promise.all([
      prisma.autoConversionRule.count({ where }),
      prisma.autoConversionRule.findMany({
        where,
        include: { runs: { orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    return ok({ rules }, buildPagination(page, limit, total));
  });

  app.post("/auto-conversion/rules", async (request, reply) => {
    const body = request.body as AnyBody;
    const data = buildAutoRulePayload(body) as Prisma.AutoConversionRuleUncheckedCreateInput;
    if (!data.name || !data.sourceRef) return reply.code(400).send(fail("BAD_REQUEST", "Cần nhập tên cấu hình và nguồn lấy bài."));
    const rule = await prisma.autoConversionRule.create({ data });
    return ok({ rule });
  });

  app.get("/auto-conversion/rules/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rule = await prisma.autoConversionRule.findUnique({ where: { id }, include: { runs: { orderBy: { createdAt: "desc" }, take: 10 } } });
    if (!rule) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy cấu hình chuyển đổi tự động."));
    return ok({ rule });
  });

  app.put("/auto-conversion/rules/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rule = await prisma.autoConversionRule.update({ where: { id }, data: buildAutoRulePayload(request.body as AnyBody, true) as Prisma.AutoConversionRuleUncheckedUpdateInput }).catch(() => null);
    if (!rule) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy cấu hình chuyển đổi tự động."));
    return ok({ rule });
  });

  app.delete("/auto-conversion/rules/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await prisma.autoConversionRule.delete({ where: { id } }).catch(() => null);
    if (!deleted) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy cấu hình chuyển đổi tự động."));
    return ok({ success: true });
  });

  app.post("/auto-conversion/rules/:id/test", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    const rule = await prisma.autoConversionRule.findUnique({ where: { id } });
    if (!rule) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy cấu hình chuyển đổi tự động."));

    const sampleText = String(body.text ?? body.sampleText ?? rule.sourceRef);
    const links = collectLinks(sampleText);
    const warnings = links.filter((link) => link.action === "saved_for_review").map((link) => `${link.originalUrl}: ${link.reason}`);
    return ok({
      detectedItems: [{ sourceRef: rule.sourceRef, text: sampleText, links }],
      warnings,
      preview: {
        originalText: sampleText,
        targetAccountIds: rule.targetAccountIds,
        nextStatus: warnings.length > 0 ? "saved_for_review" : "ready_to_publish"
      }
    });
  });

  app.post("/auto-conversion/rules/:id/run-now", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    const rule = await prisma.autoConversionRule.findUnique({ where: { id } });
    if (!rule) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy cấu hình chuyển đổi tự động."));

    const sourceExternalId = `manual-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const originalText = String(body.text ?? `Kiểm tra nguồn ${rule.sourceRef}`);
    const links = collectLinks(originalText);
    const hasUnsupportedLink = links.some((link) => link.action === "saved_for_review");
    const targetAccountIds = Array.isArray(rule.targetAccountIds) ? rule.targetAccountIds.map(String) : [];
    const run = await prisma.autoConversionRun.create({
      data: {
        ruleId: rule.id,
        sourcePlatform: rule.sourcePlatform,
        sourceRef: rule.sourceRef,
        sourceExternalId,
        originalText,
        status: hasUnsupportedLink ? "saved_for_review" : "new_detected",
        targetAccountIds,
        metadata: { trigger: "manual_run_now", queuedAt: new Date().toISOString() },
        links: {
          create: links.map((link) => ({
            originalUrl: link.originalUrl,
            network: link.network,
            action: link.action === "convert" ? "converted" : "saved_for_review",
            error: link.reason
          }))
        }
      }
    });

    if (hasUnsupportedLink) {
      const content = await prisma.content.create({
        data: {
          code: `AUTO-SAVED-${Date.now()}-${randomUUID().slice(0, 4)}`,
          platform: rule.sourcePlatform,
          sourceUrl: rule.sourceRef,
          originalText,
          status: "saved",
          savedReason: "Có link chưa hỗ trợ convert tự động",
          savedSource: "auto_conversion",
          scheduledTargets: targetAccountIds,
          metadata: { autoConversionRunId: run.id }
        }
      });
      await prisma.autoConversionRun.update({ where: { id: run.id }, data: { contentId: content.id } });
    }

    const job = await prisma.workerJobLog.create({
      data: {
        queueName: "auto-conversion",
        jobName: "auto-source-check",
        jobId: run.id,
        status: "queued",
        payload: { ruleId: rule.id, runId: run.id }
      }
    });
    return ok({ queued: true, jobId: job.id, runId: run.id });
  });

  app.post("/auto-conversion/rules/:id/pause", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rule = await prisma.autoConversionRule.update({ where: { id }, data: { enabled: false } }).catch(() => null);
    if (!rule) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy cấu hình chuyển đổi tự động."));
    return ok({ rule });
  });

  app.post("/auto-conversion/rules/:id/resume", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rule = await prisma.autoConversionRule.update({ where: { id }, data: { enabled: true } }).catch(() => null);
    if (!rule) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy cấu hình chuyển đổi tự động."));
    return ok({ rule });
  });

  app.get("/auto-conversion/runs", async (request) => {
    const query = request.query as AnyBody;
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const where: Prisma.AutoConversionRunWhereInput = {};

    if (query.ruleId && String(query.ruleId) !== "all") where.ruleId = String(query.ruleId);
    if (query.status && String(query.status) !== "all") where.status = String(query.status);
    if (query.sourcePlatform && String(query.sourcePlatform) !== "all") where.sourcePlatform = String(query.sourcePlatform);
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: new Date(String(query.dateFrom)) } : {}),
        ...(query.dateTo ? { lte: new Date(String(query.dateTo)) } : {})
      };
    }
    const keyword = String(query.keyword ?? "").trim();
    if (keyword) {
      const contains = { contains: keyword, mode: "insensitive" as const };
      where.OR = [{ sourceRef: contains }, { sourceExternalId: contains }, { originalText: contains }, { processedText: contains }, { errorMessage: contains }];
    }

    const [total, runs] = await Promise.all([
      prisma.autoConversionRun.count({ where }),
      prisma.autoConversionRun.findMany({
        where,
        include: { rule: true, links: true, media: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    return ok({ runs }, buildPagination(page, limit, total));
  });

  app.get("/auto-conversion/runs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const run = await prisma.autoConversionRun.findUnique({ where: { id }, include: { rule: true, links: true, media: true } });
    if (!run) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy lần chuyển đổi tự động."));
    const [content, logs] = await Promise.all([
      run.contentId ? prisma.content.findUnique({ where: { id: run.contentId } }) : null,
      prisma.workerJobLog.findMany({ where: { jobId: id }, orderBy: { createdAt: "desc" }, take: 100 })
    ]);
    return ok({ run, links: run.links, media: run.media, content, logs });
  });

  app.post("/auto-conversion/runs/:id/retry", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    const run = await prisma.autoConversionRun.update({
      where: { id },
      data: {
        status: body.fromStep ? String(body.fromStep) : "new_detected",
        errorCode: null,
        errorMessage: null,
        startedAt: new Date(),
        completedAt: null
      }
    }).catch(() => null);
    if (!run) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy lần chuyển đổi tự động."));
    await prisma.workerJobLog.create({ data: { queueName: "auto-conversion", jobName: "auto-retry", jobId: id, status: "queued", payload: { fromStep: body.fromStep ?? null } } });
    return ok({ queued: true });
  });

  app.post("/auto-conversion/runs/:id/skip", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    const run = await prisma.autoConversionRun.update({
      where: { id },
      data: { status: "skipped", errorMessage: body.reason ? String(body.reason) : undefined, completedAt: new Date() }
    }).catch(() => null);
    if (!run) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy lần chuyển đổi tự động."));
    return ok({ run });
  });
}

function registerCrawlRoutes(app: FastifyInstance) {
  app.post("/crawl-jobs", async (request, reply) => {
    const body = request.body as AnyBody;
    const sourcePlatform = normalizeSourcePlatform(body.sourcePlatform ?? body.platform);
    const sourceRef = String(body.sourceRef ?? "").trim();
    if (!sourcePlatform || !sourceRef) return reply.code(400).send(fail("BAD_REQUEST", "Cần nhập nền tảng và nguồn crawl."));

    const accountResolution = await resolveCrawlAccountId(sourcePlatform, body);
    if ("error" in accountResolution) {
      return reply.code(accountResolution.error.statusCode).send(fail(accountResolution.error.code, accountResolution.error.message));
    }

    const job = await prisma.crawlJob.create({
      data: {
        sourcePlatform,
        sourceRef,
        accountId: accountResolution.accountId ?? undefined,
        status: "pending",
        options: parseJsonObject(body.options) as Prisma.InputJsonValue,
        storageConfig: parseJsonObject(body.storageConfig) as Prisma.InputJsonValue,
        commentOptions: parseJsonObject(body.commentOptions) as Prisma.InputJsonValue,
        createdBy: "admin"
      }
    });
    await app.workerCore.runCrawlJob(job.id);
    await prisma.workerJobLog.create({
      data: {
        queueName: "crawl",
        jobName: "crawl-job-run",
        jobId: job.id,
        status: "queued",
        payload: { crawlJobId: job.id, accountId: job.accountId }
      }
    });
    return ok({ crawlJob: job });
  });

  app.get("/crawl-jobs", async (request) => {
    const query = request.query as AnyBody;
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const where: Prisma.CrawlJobWhereInput = {};
    if (query.platform && String(query.platform) !== "all") where.sourcePlatform = String(query.platform);
    if (query.status && String(query.status) !== "all") where.status = String(query.status);
    const keyword = String(query.keyword ?? "").trim();
    if (keyword) {
      const contains = { contains: keyword, mode: "insensitive" as const };
      where.OR = [{ sourceRef: contains }, { sourcePlatform: contains }, { error: contains }];
    }

    const [total, crawlJobs] = await Promise.all([
      prisma.crawlJob.count({ where }),
      prisma.crawlJob.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit })
    ]);
    return ok({ crawlJobs }, buildPagination(page, limit, total));
  });

  app.get("/crawl-jobs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const crawlJob = await prisma.crawlJob.findUnique({ where: { id }, include: { results: { take: 20, orderBy: { createdAt: "desc" } } } });
    if (!crawlJob) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy lịch sử crawl."));
    return ok({
      crawlJob,
      summary: {
        totalFound: crawlJob.totalFound,
        totalSaved: crawlJob.totalSaved,
        totalDuplicate: crawlJob.totalDuplicate,
        totalFailed: crawlJob.totalFailed
      }
    });
  });

  app.post("/crawl-jobs/:id/retry", async (request, reply) => {
    const { id } = request.params as { id: string };
    const current = await prisma.crawlJob.findUnique({ where: { id } });
    if (!current) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy lịch sử crawl."));

    let accountId = current.accountId;
    if (!accountId) {
      const accountResolution = await resolveCrawlAccountId(current.sourcePlatform, {});
      if ("error" in accountResolution) {
        return reply.code(accountResolution.error.statusCode).send(fail(accountResolution.error.code, accountResolution.error.message));
      }
      accountId = accountResolution.accountId;
    }

    const crawlJob = await prisma.crawlJob.update({
      where: { id },
      data: { status: "pending", error: null, startedAt: null, completedAt: null, accountId }
    });
    await app.workerCore.runCrawlJob(id);
    await prisma.workerJobLog.create({ data: { queueName: "crawl", jobName: "crawl-job-run", jobId: id, status: "queued", payload: { retry: true, accountId } } });
    return ok({ queued: true });
  });

  app.post("/crawl-jobs/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const crawlJob = await prisma.crawlJob.update({ where: { id }, data: { status: "cancelled", completedAt: new Date() } }).catch(() => null);
    if (!crawlJob) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy lịch sử crawl."));
    return ok({ crawlJob });
  });

  app.get("/crawl-results", async (request) => {
    const query = request.query as AnyBody;
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const where: Prisma.CrawlResultWhereInput = {};
    if (query.crawlJobId) where.crawlJobId = String(query.crawlJobId);
    if (query.platform && String(query.platform) !== "all") where.platform = String(query.platform);
    if (query.status && String(query.status) !== "all") where.status = String(query.status);
    const keyword = String(query.keyword ?? "").trim();
    if (keyword) {
      const contains = { contains: keyword, mode: "insensitive" as const };
      where.OR = [{ originalText: contains }, { sourceRef: contains }, { externalId: contains }, { author: contains }, { sourceUrl: contains }];
    }

    const [total, results] = await Promise.all([
      prisma.crawlResult.count({ where }),
      prisma.crawlResult.findMany({ where, include: { crawlJob: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit })
    ]);
    return ok({ results }, buildPagination(page, limit, total));
  });

  app.get("/crawl-results/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await prisma.crawlResult.findUnique({ where: { id }, include: { crawlJob: true } });
    if (!result) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy kết quả crawl."));
    return ok({ result });
  });

  app.post("/crawl-results/:id/create-content", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await prisma.crawlResult.findUnique({ where: { id } });
    if (!result) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy kết quả crawl."));
    const content = await createContentFromCrawlResult(result);
    return ok({ content });
  });

  app.post("/crawl-results/bulk-create-content", async (request) => {
    const body = request.body as AnyBody;
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
    const results = await prisma.crawlResult.findMany({ where: { id: { in: ids } } });
    const created: unknown[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const result of results) {
      try {
        created.push(await createContentFromCrawlResult(result));
      } catch (error) {
        failed.push({ id: result.id, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return ok({ created, failed });
  });

  app.delete("/crawl-results/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await prisma.crawlResult.update({ where: { id }, data: { status: "deleted" } }).catch(() => null);
    if (!result) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy kết quả crawl."));
    return ok({ success: true });
  });
}

async function createContentFromCrawlResult(result: CrawlResult) {
  const media = Array.isArray(result.media) ? result.media as AnyBody[] : [];
  const links = Array.isArray(result.links) ? result.links as AnyBody[] : collectLinks(result.originalText);
  const content = await prisma.content.create({
    data: {
      code: `CRL-${Date.now()}-${randomUUID().slice(0, 6)}`,
      platform: result.platform,
      externalId: result.externalId,
      sourceUrl: result.sourceUrl,
      author: result.author,
      originalText: result.originalText,
      status: "draft",
      metadata: {
        crawlResultId: result.id,
        crawlJobId: result.crawlJobId,
        comments: result.comments
      },
      media: {
        create: media.map((item, index) => ({
          type: String(item.type ?? (String(item.mimeType ?? "").startsWith("video/") ? "video" : "image")),
          mimeType: item.mimeType ? String(item.mimeType) : undefined,
          sourceUrl: item.sourceUrl ? String(item.sourceUrl) : undefined,
          localPath: item.localPath ? String(item.localPath) : undefined,
          cdnUrl: item.cloudinaryUrl ? String(item.cloudinaryUrl) : item.cdnUrl ? String(item.cdnUrl) : undefined,
          metadata: { ...item, sortOrder: index }
        }))
      },
      links: {
        create: links.map((link: AnyBody) => ({
          originalUrl: String(link.originalUrl ?? link.url),
          convertedUrl: link.convertedUrl ? String(link.convertedUrl) : undefined,
          network: String(link.network ?? "unknown"),
          status: link.convertedUrl ? "converted" : "detected"
        })).filter((link) => link.originalUrl)
      }
    }
  });
  await prisma.crawlResult.update({ where: { id: result.id }, data: { status: "converted_to_content", contentId: content.id } });
  return content;
}

function registerSourceRoutes(app: FastifyInstance) {
  app.get("/sources", async () => ok({ sources: await prisma.sourceAccount.findMany({ orderBy: { createdAt: "desc" } }) }));
  app.post("/sources", async (request) => ok({ source: await prisma.sourceAccount.create({ data: request.body as any }) }));
  app.put("/sources/:id", async (request) => ok({ source: await prisma.sourceAccount.update({ where: request.params as { id: string }, data: request.body as any }) }));
  app.delete("/sources/:id", async (request) => {
    await prisma.sourceAccount.delete({ where: request.params as { id: string } });
    return ok({ success: true });
  });
  app.post("/sources/:id/crawl", async (request) => {
    const { id } = request.params as { id: string };
    await app.workerCore.triggerCrawl(id, "admin");
    return ok({ queued: true });
  });
  app.get("/sources/:id/logs", async (request) => {
    const { id } = request.params as { id: string };
    return ok({ logs: await prisma.activityLog.findMany({ where: { sourceId: id }, orderBy: { createdAt: "desc" }, take: 100 }) });
  });
}

async function deleteTargetAccountCascade(app: FastifyInstance, id: string) {
  const target = await prisma.targetAccount.findUnique({ where: { id } });
  if (!target) return null;

  const schedules = await prisma.schedule.findMany({ where: { targetId: id }, select: { id: true, contentId: true } });
  await Promise.all(schedules.map((schedule) => removeScheduleQueueJobs(app, schedule.id).catch(() => undefined)));

  await Promise.all(
    [...browserLoginSessions.entries()]
      .filter(([, session]) => session.accountId === id)
      .map(async ([sessionId, session]) => {
        await session.browserContext?.close().catch(() => undefined);
        browserLoginSessions.delete(sessionId);
      })
  );

  const deleted = await prisma.$transaction(async (tx) => {
    const fbTargets = await tx.fbPostTarget.findMany({ where: { targetAccountId: id }, select: { id: true } });
    const fbTargetIds = fbTargets.map((item) => item.id);

    if (fbTargetIds.length > 0) {
      await tx.fbExecution.updateMany({ where: { targetId: { in: fbTargetIds } }, data: { targetId: null } });
      await tx.fbPostTarget.deleteMany({ where: { id: { in: fbTargetIds } } });
    }

    await tx.platformSession.deleteMany({ where: { accountKind: "target", accountId: id } });
    await tx.routingRule.deleteMany({ where: { targetId: id } });
    await tx.schedule.deleteMany({ where: { targetId: id } });
    await tx.commentQueue.deleteMany({ where: { targetId: id } });
    await tx.publishAttempt.deleteMany({ where: { targetId: id } });

    return tx.targetAccount.delete({ where: { id } });
  });

  await Promise.all([...new Set(schedules.map((schedule) => schedule.contentId))].map((contentId) => syncContentScheduleSummary(contentId).catch(() => undefined)));
  return deleted;
}

function registerTargetRoutes(app: FastifyInstance) {
  app.get("/targets", async () => ok({ targets: await prisma.targetAccount.findMany({ orderBy: { createdAt: "desc" } }) }));
  app.post("/targets", async (request, reply) => {
    const data = buildTargetAccountPayload(request.body as AnyBody) as Prisma.TargetAccountUncheckedCreateInput;
    if (!String(data.name ?? "").trim() || !String(data.platform ?? "").trim()) {
      return reply.code(400).send(fail("BAD_REQUEST", "Cần nhập tên và nền tảng tài khoản."));
    }
    return ok({ target: await prisma.targetAccount.create({ data }) });
  });
  app.put("/targets/:id", async (request, reply) => {
    const current = await prisma.targetAccount.findUnique({ where: request.params as { id: string }, select: { platform: true } });
    if (!current) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy tài khoản đăng."));
    const target = await prisma.targetAccount.update({
      where: request.params as { id: string },
      data: buildTargetAccountPayload({ ...(request.body as AnyBody), platform: (request.body as AnyBody).platform ?? current.platform }, true) as Prisma.TargetAccountUncheckedUpdateInput
    }).catch(() => null);
    if (!target) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy tài khoản đăng."));
    return ok({ target });
  });
  app.delete("/targets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    let target;
    try {
      target = await deleteTargetAccountCascade(app, id);
    } catch {
      return reply.code(500).send(fail("TARGET_DELETE_FAILED", "Không thể xóa tài khoản vì vẫn còn dữ liệu liên quan. Hãy thử tải lại trang rồi xóa lại."));
    }
    if (!target) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy tài khoản đăng."));
    return ok({ success: true });
  });
  app.get("/targets/:id/logs", async (request) => {
    const { id } = request.params as { id: string };
    return ok({ logs: await prisma.activityLog.findMany({ where: { targetId: id }, orderBy: { createdAt: "desc" }, take: 100 }) });
  });
}

function registerRoutingRoutes(app: FastifyInstance) {
  app.get("/routing-rules", async () => ok({ rules: await prisma.routingRule.findMany({ include: { source: true, target: true }, orderBy: { createdAt: "desc" } }) }));
  app.post("/routing-rules", async (request) => ok({ rule: await prisma.routingRule.create({ data: request.body as any }) }));
  app.put("/routing-rules/:id", async (request) => ok({ rule: await prisma.routingRule.update({ where: request.params as { id: string }, data: request.body as any }) }));
  app.delete("/routing-rules/:id", async (request) => {
    await prisma.routingRule.delete({ where: request.params as { id: string } });
    return ok({ success: true });
  });
}

function registerLinkRoutes(app: FastifyInstance) {
  app.post("/links/detect", async (request) => {
    const body = request.body as AnyBody;
    return ok({ links: detectLinks(String(body.text ?? "")) });
  });
  app.post("/links/convert", async (request) => {
    const body = request.body as AnyBody;
    const urls = Array.isArray(body.urls) ? body.urls.map(String) : [];
    const results = await Promise.all(
      urls.map(async (url) => {
        const resolvedUrl = await expandUrl(url, followRedirectUrl);
        const detected = detectLinks(resolvedUrl)[0] ?? { url: resolvedUrl, network: detectNetwork(resolvedUrl) };
        const result = await app.workerCore.registry.affiliateAdapter.convert({
          url: resolvedUrl,
          network: detected.network,
          campaignId: body.campaignId,
          subId: body.subId
        });
        return { ...result, originalUrl: url, resolvedUrl };
      })
    );
    return ok({ results });
  });
}

async function followRedirectUrl(url: string): Promise<string> {
  const headers = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const head = await fetch(url, { method: "HEAD", redirect: "follow", headers, signal: controller.signal });
    return head.url || url;
  } catch {
    const getController = new AbortController();
    const getTimeout = setTimeout(() => getController.abort(), 10_000);
    try {
      const get = await fetch(url, { method: "GET", redirect: "follow", headers, signal: getController.signal });
      await get.body?.cancel().catch(() => undefined);
      return get.url || url;
    } finally {
      clearTimeout(getTimeout);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function readConvertToolPayload(request: FastifyRequest) {
  const isMultipart = typeof (request as AnyBody).isMultipart === "function" && (request as AnyBody).isMultipart();
  if (!isMultipart) {
    const body = (request.body ?? {}) as AnyBody;
    return {
      fields: body,
      rows: Array.isArray(body.rows) ? body.rows as Record<string, unknown>[] : [],
      text: String(body.text ?? "")
    };
  }

  const fields: AnyBody = {};
  let rows: Record<string, unknown>[] = [];
  let text = "";
  const parts = request.parts();

  for await (const part of parts) {
    if (part.type === "field") {
      fields[part.fieldname] = part.value;
      continue;
    }

    const buffer = await part.toBuffer();
    const filename = part.filename.toLowerCase();
    if (filename.endsWith(".xlsx") || filename.endsWith(".xls") || filename.endsWith(".csv")) {
      rows = parseWorkbookRows(buffer);
      text += `\n${rows.map((row) => Object.values(row).join(" ")).join("\n")}`;
    } else {
      text += `\n${buffer.toString("utf8")}`;
    }
  }

  return {
    fields,
    rows,
    text: `${fields.text ?? ""}\n${text}`.trim()
  };
}

function parseWorkbookRows(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: "" });
}

function getRowValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}

function replaceAllUrls(text: string, results: ConvertLinkBatch["results"]) {
  return results.reduce((current, result) => {
    if (!result.convertedUrl) return current;
    return current.split(result.originalUrl).join(result.convertedUrl);
  }, text);
}

function cleanShopeeUrlParameters(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    url.search = "";
    return url.toString();
  } catch {
    return urlStr;
  }
}

function buildManualShopeeAffiliateLink(
  targetUrl: string,
  affiliateId: string,
  subIdsInput?: string[],
  subIdInput?: string,
  shopeeConfig?: any
): string {
  const cleanUrl = cleanShopeeUrlParameters(targetUrl);
  const encodedUrl = encodeURIComponent(cleanUrl);

  let subId = "";
  if (subIdInput) {
    subId = subIdInput;
  } else if (subIdsInput && subIdsInput.some(Boolean)) {
    subId = subIdsInput.map(s => s.trim()).filter(Boolean).join("-");
  } else if (shopeeConfig?.subIds) {
    const s = shopeeConfig.subIds;
    subId = [s.subId1, s.subId2, s.subId3, s.subId4, s.subId5]
      .map(val => String(val || "").trim())
      .filter(Boolean)
      .join("-");
  }

  let result = `https://s.shopee.vn/an_redir?origin_link=${encodedUrl}&affiliate_id=${affiliateId.trim()}`;
  if (subId) {
    result += `&sub_id=${encodeURIComponent(subId)}`;
  }
  return result;
}

function registerConvertLinkToolRoutes(app: FastifyInstance) {
  app.get("/tools/convert-link/extension-status", async () => {
    return ok(zerunExtensionBridge.getStatus());
  });

  app.post("/tools/convert-link/extension-convert", async (request) => {
    const body = request.body as AnyBody;
    const url = String(body.url ?? body.originalUrl ?? "").trim();
    const outputType = String(body.outputType ?? "shortlink") === "full" ? "full" : "shortlink";
    const subIdsRaw = Array.isArray(body.subIds) ? body.subIds : [];
    const subIds = subIdsRaw.map((item) => String(item ?? ""));
    const subId = typeof body.subId === "string" ? body.subId : undefined;

    // Load Shopee Config từ DB để dùng cho fallback hoặc Lazada subId
    let shopeeConfig: any = null;
    let lazadaSubIdSet = body.lazadaSubIdSet;
    const isLazada = url.includes("lazada.vn") || url.includes("s.lazada.vn");
    const isShopee = url.includes("shopee.vn") || url.includes("shp.ee") || url.includes("shopee.ee") || url.includes("shopee.");

    try {
      const setting = await prisma.systemSetting.findUnique({ where: { key: "affiliate_settings" } });
      const affiliateConfig = (setting?.value || {}) as any;
      shopeeConfig = affiliateConfig.shopee;

      if (isLazada && !lazadaSubIdSet) {
        const subIdSets = affiliateConfig.lazada?.subIdSets || [];
        const defaultSet = subIdSets.find((s: any) => s.isDefault) || subIdSets[0];
        if (defaultSet) {
          lazadaSubIdSet = defaultSet;
        }
      }
    } catch (e) {
      // ignore
    }

    const shopeeAffiliateId = (shopeeConfig?.enabled && shopeeConfig.affiliateId) ? shopeeConfig.affiliateId.trim() : "";

    let result: any = null;
    let convertError: any = null;

    try {
      result = await zerunExtensionBridge.convert({
        url,
        subIds,
        subId,
        outputType,
        lazadaSubIdSet,
        shopeeAffiliateId
      });
    } catch (error) {
      convertError = error;
    }

    // Nếu Extension convert thành công -> Trả về kết quả từ Extension
    if (result && result.status === "DONE") {
      return ok({
        ...result,
        originalUrl: url,
        convertedUrl: outputType === "full" ? result.longLink ?? result.shortLink ?? null : result.shortLink ?? result.longLink ?? null,
        success: true
      });
    }

    // Nếu Extension lỗi/không kết nối, và là Shopee có cấu hình affiliateId -> Fallback thủ công
    if (isShopee && shopeeAffiliateId) {
      try {
        const resolvedUrl = await expandUrl(url, followRedirectUrl);
        const fallbackUrl = buildManualShopeeAffiliateLink(resolvedUrl, shopeeAffiliateId, subIds, subId, shopeeConfig);
        return ok({
          status: "DONE",
          originalUrl: url,
          convertedUrl: fallbackUrl,
          shortLink: fallbackUrl,
          longLink: fallbackUrl,
          rawLongLink: fallbackUrl,
          success: true,
          via: "manual_fallback"
        });
      } catch (fallbackErr) {
        // ignore and let it fail below
      }
    }

    // Nếu không fallback được, trả về lỗi nguyên bản
    const message = result?.message || (convertError instanceof Error ? convertError.message : "Extension không trả kết quả.");
    const errorCode = result?.errorCode || "EXTENSION_ERROR";
    return ok({
      status: result?.status || "FAILED",
      originalUrl: url,
      convertedUrl: null,
      success: false,
      errorCode,
      message
    });
  });

  app.post("/tools/convert-link/lazada/sync-subid", async (request) => {
    const body = request.body as AnyBody;
    const action = String(body.action ?? "").trim() as "add" | "edit" | "delete" | "set-default";
    const template = (body.template ?? {}) as any;
    const setId = String(body.setId ?? template.id ?? "").trim();

    try {
      const setting = await prisma.systemSetting.findUnique({ where: { key: "affiliate_settings" } });
      const affiliateConfig = (setting?.value || { lazada: {} }) as any;
      if (!affiliateConfig.lazada) {
        affiliateConfig.lazada = {};
      }
      if (!Array.isArray(affiliateConfig.lazada.subIdSets)) {
        // Migration từ subIds cũ
        const oldSubIds = affiliateConfig.lazada.subIds || {
          subId1: "", subId2: "", subId3: "", subId4: "", subId5: "", subId6: ""
        };
        affiliateConfig.lazada.subIdSets = [
          {
            id: "default",
            name: "Mặc định",
            subId1: oldSubIds.subId1 || "",
            subId2: oldSubIds.subId2 || "",
            subId3: oldSubIds.subId3 || "",
            subId4: oldSubIds.subId4 || "",
            subId5: oldSubIds.subId5 || "",
            subId6: oldSubIds.subId6 || "",
            isDefault: true,
            subIdKey: ""
          }
        ];
      }

      let subIdSets = affiliateConfig.lazada.subIdSets as any[];

      if (action === "set-default") {
        if (!setId) {
          return fail("BAD_REQUEST", "Thiếu Set ID để đặt làm mặc định.");
        }
        subIdSets = subIdSets.map((s) => ({
          ...s,
          isDefault: s.id === setId
        }));
        affiliateConfig.lazada.subIdSets = subIdSets;
        // Cập nhật trường subId tương thích ngược
        const defaultSet = subIdSets.find((s) => s.isDefault);
        if (defaultSet) {
          affiliateConfig.lazada.subId = JSON.stringify({
            subId1: defaultSet.subId1,
            subId2: defaultSet.subId2,
            subId3: defaultSet.subId3,
            subId4: defaultSet.subId4,
            subId5: defaultSet.subId5,
            subId6: defaultSet.subId6,
          });
        }
        await prisma.systemSetting.upsert({
          where: { key: "affiliate_settings" },
          create: { key: "affiliate_settings", value: affiliateConfig },
          update: { value: affiliateConfig }
        });
        return ok({ success: true, subIdSets });
      }

      // Với các action tương tác extension (add, edit, delete)
      if (action === "add" || action === "edit" || action === "delete") {
        const syncResult = await zerunExtensionBridge.syncLazadaSubId(action, template);
        if (!syncResult.success && syncResult.status !== "DONE") {
          return fail("BAD_REQUEST", syncResult.message || syncResult.error || "Extension đồng bộ thất bại.");
        }

        const subIdKey = String(syncResult.subIdKey ?? syncResult.templateKey ?? template.subIdKey ?? "").trim();

        if (action === "add") {
          const newSet = {
            id: template.id || `set_${randomUUID()}`,
            name: template.name || "Set mới",
            subId1: template.subId1 || "",
            subId2: template.subId2 || "",
            subId3: template.subId3 || "",
            subId4: template.subId4 || "",
            subId5: template.subId5 || "",
            subId6: template.subId6 || "",
            isDefault: subIdSets.length === 0 ? true : !!template.isDefault,
            subIdKey
          };
          if (newSet.isDefault) {
            subIdSets = subIdSets.map((s) => ({ ...s, isDefault: false }));
          }
          subIdSets.push(newSet);
        } else if (action === "edit") {
          subIdSets = subIdSets.map((s) => {
            if (s.id === template.id) {
              return {
                ...s,
                name: template.name || s.name,
                subId1: template.subId1 ?? s.subId1,
                subId2: template.subId2 ?? s.subId2,
                subId3: template.subId3 ?? s.subId3,
                subId4: template.subId4 ?? s.subId4,
                subId5: template.subId5 ?? s.subId5,
                subId6: template.subId6 ?? s.subId6,
                isDefault: template.isDefault ?? s.isDefault,
                subIdKey: subIdKey || s.subIdKey
              };
            }
            return s;
          });
        } else if (action === "delete") {
          subIdSets = subIdSets.filter((s) => s.id !== setId && s.subIdKey !== subIdKey);
          // Nếu xóa mất set mặc định, tự chọn set đầu tiên làm mặc định
          if (subIdSets.length > 0 && !subIdSets.some((s) => s.isDefault)) {
            subIdSets[0].isDefault = true;
          }
        }

        affiliateConfig.lazada.subIdSets = subIdSets;
        // Cập nhật trường subId tương thích ngược
        const defaultSet = subIdSets.find((s) => s.isDefault);
        if (defaultSet) {
          affiliateConfig.lazada.subId = JSON.stringify({
            subId1: defaultSet.subId1,
            subId2: defaultSet.subId2,
            subId3: defaultSet.subId3,
            subId4: defaultSet.subId4,
            subId5: defaultSet.subId5,
            subId6: defaultSet.subId6,
          });
        }
        await prisma.systemSetting.upsert({
          where: { key: "affiliate_settings" },
          create: { key: "affiliate_settings", value: affiliateConfig },
          update: { value: affiliateConfig }
        });

        return ok({ success: true, subIdSets });
      }

      return fail("BAD_REQUEST", "Action không hợp lệ.");
    } catch (e: any) {
      return fail("INTERNAL_SERVER_ERROR", e.message || "Lỗi xử lý đồng bộ Sub ID Lazada.");
    }
  });

  app.post("/tools/convert-link/detect", async (request) => {
    const payload = await readConvertToolPayload(request);
    const subIds = parseJsonArray(payload.fields.subIds);
    const text = payload.text || payload.rows.map((row) => Object.values(row).join(" ")).join("\n");
    const links = collectLinks(text);
    const batchId = randomUUID();
    const batch: ConvertLinkBatch = {
      id: batchId,
      text,
      rows: payload.rows,
      links,
      subIds,
      results: [],
      createdAt: new Date().toISOString()
    };
    convertLinkBatches.set(batchId, batch);
    return ok({ links, batchId });
  });

  app.post("/tools/convert-link/export-batch", async (request, reply) => {
    const body = request.body as AnyBody;
    const batchId = String(body.batchId ?? "");
    const batch = convertLinkBatches.get(batchId);
    if (!batch) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy batch convert link."));

    const rows = batch.links.map((link) => ({
      "Liên kết gốc": link.originalUrl,
      "Sub_id1": batch.subIds[0] ?? "",
      "Sub_id2": batch.subIds[1] ?? "",
      "Sub_id3": batch.subIds[2] ?? "",
      "Sub_id4": batch.subIds[3] ?? "",
      "Sub_id5": batch.subIds[4] ?? ""
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { header: ["Liên kết gốc", "Sub_id1", "Sub_id2", "Sub_id3", "Sub_id4", "Sub_id5"] }), "Batch Custom Links");
    const filename = `${batchId}-Batch-Custom-Links.xlsx`;
    const fullPath = path.join(getExportDir(), filename);
    writeFileSync(fullPath, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

    return ok({ fileUrl: `/api/v1/tools/convert-link/download/${filename}`, filename });
  });

  app.get("/tools/convert-link/download/:filename", async (request, reply) => {
    const { filename } = request.params as { filename: string };
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "");
    const fullPath = path.join(getExportDir(), safeName);
    if (!existsSync(fullPath)) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy file xuất."));
    reply.header("Content-Disposition", `attachment; filename="${safeName}"`);
    reply.header("Content-Type", safeName.endsWith(".csv") ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return reply.send(createReadStream(fullPath));
  });

  app.post("/tools/convert-link/import-result", async (request, reply) => {
    const payload = await readConvertToolPayload(request);
    const batchId = String(payload.fields.batchId ?? "");
    const batch = convertLinkBatches.get(batchId);
    if (!batch) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy batch convert link."));

    const csvText = String(payload.fields.csvText ?? "").trim();
    const rows = payload.rows.length > 0 ? payload.rows : csvText ? parseWorkbookRows(Buffer.from(csvText, "utf8")) : [];
    const results = rows.map((row) => ({
      originalUrl: getRowValue(row, ["Liên kết gốc", "Lien ket goc", "Original URL", "originalUrl"]),
      convertedUrl: getRowValue(row, ["Liên kết chuyển đổi", "Lien ket chuyen doi", "Converted URL", "convertedUrl"]),
      failureReason: getRowValue(row, ["Lí do thất bại", "Lý do thất bại", "Li do that bai", "Ly do that bai", "failureReason"])
    })).filter((row) => row.originalUrl);

    batch.results = results;
    convertLinkBatches.set(batch.id, batch);
    return ok({
      total: results.length,
      converted: results.filter((result) => result.convertedUrl).length,
      failed: results.filter((result) => !result.convertedUrl).length,
      results
    });
  });

  app.post("/tools/convert-link/apply-result", async (request, reply) => {
    const body = request.body as AnyBody;
    const batchId = String(body.batchId ?? "");
    const output = String(body.output ?? "text");
    const batch = convertLinkBatches.get(batchId);
    if (!batch) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy batch convert link."));

    if (output === "xlsx") {
      const replacedRows = batch.rows.length > 0
        ? batch.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? replaceAllUrls(value, batch.results) : value])))
        : [{ "Nội dung": replaceAllUrls(batch.text, batch.results) }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(replacedRows), "Kết quả");
      const filename = `${batchId}-converted-result.xlsx`;
      writeFileSync(path.join(getExportDir(), filename), XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
      return ok({ fileUrl: `/api/v1/tools/convert-link/download/${filename}`, filename });
    }

    return ok({ text: replaceAllUrls(batch.text, batch.results) });
  });
}

function registerScheduleRoutes(app: FastifyInstance) {
  app.get("/schedules", async () => ok({ schedules: await prisma.schedule.findMany({ include: { content: true, target: true }, orderBy: { scheduledAt: "asc" } }) }));
  app.post("/schedules", async (request, reply) => createSchedule(request, reply, app));
  app.put("/schedules/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    const current = await prisma.schedule.findUnique({ where: { id } });
    if (!current) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy lịch đăng."));

    const scheduledAt = body.scheduledAt !== undefined ? parseDateInput(body.scheduledAt) : current.scheduledAt;
    if (!scheduledAt) return reply.code(400).send(fail("INVALID_SCHEDULE", "Thời gian hẹn đăng không hợp lệ."));

    await removeScheduleQueueJobs(app, id);
    const schedule = await prisma.schedule.update({
      where: { id },
      data: {
        ...(body.contentId !== undefined ? { contentId: String(body.contentId) } : {}),
        ...(body.targetId !== undefined ? { targetId: String(body.targetId) } : {}),
        scheduledAt,
        ...(body.status !== undefined ? { status: String(body.status) } : {})
      }
    });

    if (schedule.status === "scheduled") {
      await app.workerCore.scheduleRelease(schedule.id, schedule.scheduledAt);
    }
    await Promise.all(uniqueStrings([current.contentId, schedule.contentId]).map((contentId) => syncContentScheduleSummary(contentId)));
    return ok({ schedule });
  });
  app.delete("/schedules/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const schedule = await prisma.schedule.findUnique({ where: { id } });
    if (!schedule) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy lịch đăng."));
    await removeScheduleQueueJobs(app, id);
    await prisma.schedule.delete({ where: { id } });
    await syncContentScheduleSummary(schedule.contentId);
    return ok({ success: true });
  });
}

async function createSchedule(request: FastifyRequest, reply: FastifyReply, app: FastifyInstance) {
  const body = request.body as AnyBody;
  const contentId = String(body.contentId);
  const scheduledAt = parseDateInput(body.scheduledAt);
  if (!scheduledAt) return reply.code(400).send(fail("INVALID_SCHEDULE", "Thời gian hẹn đăng không hợp lệ."));
  const targetIds = normalizePathList(body.targetIds);
  if (targetIds.length === 0) return reply.code(400).send(fail("TARGET_REQUIRED", "Cần chọn ít nhất một tài khoản đăng."));
  const schedules = await scheduleContentForTargets(app, contentId, targetIds, scheduledAt);
  return ok({ schedules });
}

type BrowserPlatform = BrowserLoginPlatform;

const PLATFORM_SESSION_ROOTS: Record<BrowserPlatform, string> = {
  facebook: config.FACEBOOK_SESSION_ROOT,
  instagram: config.INSTAGRAM_SESSION_ROOT,
  threads: config.THREADS_SESSION_ROOT,
  x: config.X_SESSION_ROOT
};

async function inspectPersistedBrowserAccountHealth(app: FastifyInstance, account: AnyBody, platform: BrowserPlatform) {
  const credentials = (account.credentials ?? {}) as Record<string, unknown>;
  const sessionRoot = PLATFORM_SESSION_ROOTS[platform];
  const authPath = typeof credentials.authPath === "string" ? credentials.authPath : path.resolve(sessionRoot, `${account.id}`, "auth.json");
  const sessionDir = typeof credentials.sessionDir === "string" ? credentials.sessionDir : undefined;
  const hasSessionFile = existsSync(authPath);

  const platformLabel = platform === "facebook" ? "Facebook" : platform === "instagram" ? "Instagram" : platform === "threads" ? "Threads" : "X";

  if (!hasSessionFile) {
    return {
      status: "missing",
      authState: "login_required",
      authPath,
      sessionDir,
      hasSessionFile: false,
      checkedAt: new Date().toISOString(),
      message: `Chưa có file session ${platformLabel}.`
    };
  }

  const adapterAccount = {
    id: String(account.id),
    platform: platform as Platform,
    name: String(account.name),
    handle: account.handle ? String(account.handle) : null,
    credentials,
    config: (account.config ?? {}) as Record<string, unknown>
  };

  try {
    const health = await app.workerCore.registry.getPublish(platform).testConnection(adapterAccount);
    return {
      status: health.status,
      authState: health.status === "healthy" ? "authenticated" : health.status === "checkpoint" ? "checkpoint" : "login_required",
      authPath,
      sessionDir,
      hasSessionFile: true,
      checkedAt: new Date().toISOString(),
      message: health.message,
      metadata: health.metadata ?? null
    };
  } catch (error) {
    return {
      status: "failed",
      authState: "unknown",
      authPath,
      sessionDir,
      hasSessionFile: true,
      checkedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

/** @deprecated use inspectPersistedBrowserAccountHealth(app, account, "facebook") */
function inspectPersistedFacebookAccountHealth(app: FastifyInstance, account: AnyBody) {
  return inspectPersistedBrowserAccountHealth(app, account, "facebook");
}

function registerAccountRoutes(app: FastifyInstance) {
  app.get("/accounts", async () => {
    const [sources, targets, persistedSessions] = await Promise.all([
      prisma.sourceAccount.findMany(),
      prisma.targetAccount.findMany(),
      prisma.platformSession.findMany({ where: { platform: { in: ["facebook", "instagram", "threads", "x"] }, accountKind: "target" } })
    ]);
    const persistedByAccountId = new Map(persistedSessions.map((session) => [session.accountId, session]));
    return ok({
      accounts: [
        ...sources.map((account) => ({ ...account, kind: "source" })),
        ...targets.map((account) => {
          const { credentials: _credentials, config: _config, ...publicAccount } = account;
          return {
            ...publicAccount,
            kind: "target",
            sessionState: ["facebook", "instagram", "threads", "x"].includes(account.platform) ? omitSessionPathFields(persistedByAccountId.get(account.id)?.data) ?? null : null
          };
        })
      ]
    });
  });
  app.put("/accounts/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    const updated = body.kind === "source"
      ? await prisma.sourceAccount.update({ where: { id }, data: body })
      : await prisma.targetAccount.update({
          where: { id },
          data: buildTargetAccountPayload(body, true) as Prisma.TargetAccountUncheckedUpdateInput
        });
    return ok({ account: updated });
  });
  app.post("/accounts/:id/test", async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    await app.workerCore.testAccount(id, body.kind === "source" ? "source" : "target");
    return ok({ queued: true });
  });
  app.get("/accounts/:id/facebook-session", async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await prisma.targetAccount.findUnique({ where: { id } });
    if (!account || account.platform !== "facebook") {
      return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy tài khoản Facebook."));
    }

    const activeSession = Array.from(browserLoginSessions.values()).find((session) => session.accountId === id && session.platform === "facebook");
    if (activeSession) {
      return ok({ session: await buildBrowserLoginPayload(activeSession) });
    }

    const persisted = await getPersistedPlatformAccountSessionState("facebook", id);
    const health = await inspectPersistedFacebookAccountHealth(app, account);
    return ok({
      session: persisted?.data ?? null,
      health
    });
  });
  app.post("/accounts/:id/facebook-session/check", async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await prisma.targetAccount.findUnique({ where: { id } });
    if (!account || account.platform !== "facebook") {
      return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy tài khoản Facebook."));
    }

    const health = await inspectPersistedFacebookAccountHealth(app, account);
    await persistPlatformAccountSessionState("facebook", id, {
      ...(((await getPersistedPlatformAccountSessionState("facebook", id))?.data as Record<string, unknown> | null) ?? {}),
      accountId: id,
      status: health.status,
      authState: health.authState,
      authDetected: health.authState === "authenticated",
      browserOpen: false,
      authPath: health.authPath,
      sessionDir: health.sessionDir,
      lastCheckedAt: health.checkedAt,
      lastError: health.status === "failed" ? health.message : undefined,
      health
    });
    return ok({ health });
  });
  app.get("/accounts/:id/instagram-session", async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await prisma.targetAccount.findUnique({ where: { id } });
    if (!account || account.platform !== "instagram") {
      return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy tài khoản Instagram."));
    }

    const activeSession = Array.from(browserLoginSessions.values()).find((session) => session.accountId === id && session.platform === "instagram");
    if (activeSession) {
      return ok({ session: await buildBrowserLoginPayload(activeSession) });
    }

    const persisted = await getPersistedPlatformAccountSessionState("instagram", id);
    const health = await inspectPersistedBrowserAccountHealth(app, account, "instagram");
    return ok({ session: persisted?.data ?? null, health });
  });
  app.post("/accounts/:id/instagram-session/check", async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await prisma.targetAccount.findUnique({ where: { id } });
    if (!account || account.platform !== "instagram") {
      return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy tài khoản Instagram."));
    }

    const health = await inspectPersistedBrowserAccountHealth(app, account, "instagram");
    await persistPlatformAccountSessionState("instagram", id, {
      ...(((await getPersistedPlatformAccountSessionState("instagram", id))?.data as Record<string, unknown> | null) ?? {}),
      accountId: id,
      status: health.status,
      authState: health.authState,
      authDetected: health.authState === "authenticated",
      browserOpen: false,
      authPath: health.authPath,
      sessionDir: health.sessionDir,
      lastCheckedAt: health.checkedAt,
      lastError: health.status === "failed" ? health.message : undefined,
      health
    });
    return ok({ health });
  });
  app.get("/accounts/:id/threads-session", async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await prisma.targetAccount.findUnique({ where: { id } });
    if (!account || account.platform !== "threads") {
      return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy tài khoản Threads."));
    }

    const activeSession = Array.from(browserLoginSessions.values()).find((session) => session.accountId === id && session.platform === "threads");
    if (activeSession) {
      return ok({ session: await buildBrowserLoginPayload(activeSession) });
    }

    const persisted = await getPersistedPlatformAccountSessionState("threads", id);
    const health = await inspectPersistedBrowserAccountHealth(app, account, "threads");
    return ok({ session: persisted?.data ?? null, health });
  });
  app.post("/accounts/:id/threads-session/check", async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await prisma.targetAccount.findUnique({ where: { id } });
    if (!account || account.platform !== "threads") {
      return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy tài khoản Threads."));
    }

    const health = await inspectPersistedBrowserAccountHealth(app, account, "threads");
    await persistPlatformAccountSessionState("threads", id, {
      ...(((await getPersistedPlatformAccountSessionState("threads", id))?.data as Record<string, unknown> | null) ?? {}),
      accountId: id,
      status: health.status,
      authState: health.authState,
      authDetected: health.authState === "authenticated",
      browserOpen: false,
      authPath: health.authPath,
      sessionDir: health.sessionDir,
      lastCheckedAt: health.checkedAt,
      lastError: health.status === "failed" ? health.message : undefined,
      health
    });
    return ok({ health });
  });
  app.get("/accounts/:id/x-session", async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await prisma.targetAccount.findUnique({ where: { id } });
    if (!account || account.platform !== "x") {
      return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy tài khoản X."));
    }

    const activeSession = Array.from(browserLoginSessions.values()).find((session) => session.accountId === id && session.platform === "x");
    if (activeSession) {
      return ok({ session: await buildBrowserLoginPayload(activeSession) });
    }

    const persisted = await getPersistedPlatformAccountSessionState("x", id);
    const health = await inspectPersistedBrowserAccountHealth(app, account, "x");
    return ok({ session: persisted?.data ?? null, health });
  });
  app.post("/accounts/:id/x-session/check", async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await prisma.targetAccount.findUnique({ where: { id } });
    if (!account || account.platform !== "x") {
      return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy tài khoản X."));
    }

    const health = await inspectPersistedBrowserAccountHealth(app, account, "x");
    await persistPlatformAccountSessionState("x", id, {
      ...(((await getPersistedPlatformAccountSessionState("x", id))?.data as Record<string, unknown> | null) ?? {}),
      accountId: id,
      status: health.status,
      authState: health.authState,
      authDetected: health.authState === "authenticated",
      browserOpen: false,
      authPath: health.authPath,
      sessionDir: health.sessionDir,
      lastCheckedAt: health.checkedAt,
      lastError: health.status === "failed" ? health.message : undefined,
      health
    });
    return ok({ health });
  });
  app.get("/health/platforms", async () => {
    const targets = await prisma.targetAccount.findMany({ select: { id: true, name: true, platform: true, health: true, isActive: true } });
    return ok({ platformHealth: targets });
  });
}

function registerAiRoutes(app: FastifyInstance) {
  app.get("/ai/configs", async () => ok({ configs: await prisma.aiConfig.findMany({ orderBy: { createdAt: "desc" } }) }));
  app.post("/ai/configs", async (request) => ok({ config: await prisma.aiConfig.create({ data: request.body as any }) }));
  app.put("/ai/configs/:id", async (request) => ok({ config: await prisma.aiConfig.update({ where: request.params as { id: string }, data: request.body as any }) }));
  app.delete("/ai/configs/:id", async (request) => {
    await prisma.aiConfig.delete({ where: request.params as { id: string } });
    return ok({ success: true });
  });
  app.post("/ai/test", async (request) => {
    const body = request.body as AnyBody;
    return ok({ provider: body.provider ?? "none", output: "AI provider thật chưa được cấu hình. Hãy thêm adapter provider trước khi dùng production." });
  });
}

function registerImportRoutes(app: FastifyInstance) {
  app.post("/import/upload", async (request) => {
    const parts = request.parts();
    let caption = "";
    const media: AnyBody[] = [];

    for await (const part of parts) {
      if (part.type === "field" && part.fieldname === "caption") caption = String(part.value ?? "");
      if (part.type === "file") {
        media.push({
          type: part.mimetype.startsWith("video/") ? "video" : "image",
          mimeType: part.mimetype,
          metadata: { filename: part.filename }
        });
        await part.toBuffer();
      }
    }

    const content = await prisma.content.create({
      data: {
        code: `IMP-${Date.now()}`,
        platform: "manual",
        originalText: caption,
        status: "waiting_manual_convert",
        media: { create: media as any }
      }
    });
    return ok({ contentId: content.id, code: content.code });
  });
}

// ── Facebook Campaign Routes ───────────────────────────────────────────────────

async function inspectBrowserLoginSession(session: BrowserLoginSession) {
  const context = session.browserContext;
  if (!context) {
    return {
      authDetected: false,
      authState: session.status === "completed" ? "authenticated" : "unknown",
      currentUrl: session.currentUrl,
      cookieNames: session.cookieNames ?? [],
      lastCheckedAt: Date.now(),
      browserOpen: false,
      lastError: session.lastError
    } as const;
  }

  try {
    const page = context.pages()[0] ?? null;
    const cookies = await context.cookies();
    const cookieNames = cookies.map((cookie) => cookie.name).sort();
    const cookieSet = new Set(cookieNames);
    let currentUrl = page?.url() ?? session.currentUrl;
    let authState: BrowserLoginSession["authState"] = "unknown";

    if (page) {
      currentUrl = page.url();
      const pageState = await page.evaluate((platform) => {
        const bodyText = document.body?.innerText?.toLowerCase() || "";
        if (platform === "facebook") {
          const hasCredentialInputs = !!document.querySelector('input[name="email"], input[name="pass"]');
          const authPhrases = ["see more on facebook", "log in to facebook", "email address or phone number", "email address or mobile number", "create new account"];
          const checkpointPhrases = ["checkpoint", "review recent login", "secure your account", "suspended", "confirm your identity", "two-factor", "two factor"];
          return { hasCredentialInputs, hasAuthWall: hasCredentialInputs || authPhrases.some((phrase) => bodyText.includes(phrase)), hasCheckpoint: checkpointPhrases.some((phrase) => bodyText.includes(phrase)) };
        }
        if (platform === "instagram") {
          const hasCredentialInputs = !!document.querySelector('input[name="username"], input[name="password"]');
          const authPhrases = ["log in", "sign up", "create new account"];
          const checkpointPhrases = ["checkpoint", "review recent login", "confirm your identity", "suspended", "challenge"];
          return { hasCredentialInputs, hasAuthWall: hasCredentialInputs || authPhrases.some((phrase) => bodyText.includes(phrase)), hasCheckpoint: checkpointPhrases.some((phrase) => bodyText.includes(phrase)) };
        }
        const hasCredentialInputs = !!document.querySelector('input[name="username"], input[name="password"]');
        const authPhrases = ["log in", "sign in", "đăng nhập"];
        const checkpointPhrases = ["checkpoint", "confirm your identity", "suspended", "unusual login"];
        return { hasCredentialInputs, hasAuthWall: hasCredentialInputs || authPhrases.some((phrase) => bodyText.includes(phrase)), hasCheckpoint: checkpointPhrases.some((phrase) => bodyText.includes(phrase)) };
      }, session.platform);

      const hasAuthCookies = session.platform === "facebook"
        ? cookieSet.has("c_user") && cookieSet.has("xs")
        : cookieNames.length > 0;

      if (pageState.hasCheckpoint) authState = "checkpoint";
      else if (!hasAuthCookies || pageState.hasAuthWall) authState = "login_required";
      else authState = "authenticated";
    }

    return {
      authDetected: authState === "authenticated",
      authState,
      currentUrl,
      cookieNames,
      lastCheckedAt: Date.now(),
      browserOpen: true,
      lastError: undefined
    } as const;
  } catch (error) {
    return {
      authDetected: false,
      authState: "unknown",
      currentUrl: session.currentUrl,
      cookieNames: session.cookieNames ?? [],
      lastCheckedAt: Date.now(),
      browserOpen: true,
      lastError: error instanceof Error ? error.message : String(error)
    } as const;
  }
}

async function buildBrowserLoginPayload(session: BrowserLoginSession) {
  const runtime = await inspectBrowserLoginSession(session);
  session.authDetected = runtime.authDetected;
  session.authState = runtime.authState;
  session.currentUrl = runtime.currentUrl;
  session.cookieNames = runtime.cookieNames;
  session.lastCheckedAt = runtime.lastCheckedAt;
  session.lastError = runtime.lastError;
  browserLoginSessions.set(session.id, session);

  const payload = {
    sessionId: session.id,
    platform: session.platform,
    accountId: session.accountId,
    status: session.status,
    sessionDir: session.sessionDir,
    authPath: session.authPath,
    browserPid: session.browserPid,
    authDetected: session.authDetected ?? false,
    authState: session.authState ?? "unknown",
    currentUrl: session.currentUrl,
    cookieNames: session.cookieNames ?? [],
    browserOpen: runtime.browserOpen,
    lastCheckedAt: session.lastCheckedAt ? new Date(session.lastCheckedAt).toISOString() : undefined,
    createdAt: new Date(session.createdAt).toISOString(),
    lastError: session.lastError
  };

  await persistPlatformAccountSessionState(session.platform, session.accountId, payload);
  return payload;
}

function registerFacebookBrowserLoginRoutes(app: FastifyInstance) {
  app.post("/facebook/accounts/:id/browser-login/start", async (request, reply) => {
    const { id } = request.params as { id: string };
    const account = await prisma.targetAccount.findUnique({ where: { id } });
    if (!account || account.platform !== "facebook") {
      return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy tài khoản Facebook."));
    }

    const existing = Array.from(browserLoginSessions.values()).find((session) => session.accountId === id && session.status === "pending");
    if (existing) {
      return ok({
        sessionId: existing.id,
        status: existing.status,
        sessionDir: existing.sessionDir,
        authPath: existing.authPath,
        message: "Đã có phiên đăng nhập Facebook đang mở cho tài khoản này."
      });
    }

    const sessionId = randomUUID();
    const safeSlug = account.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || account.id;
    const sessionDir = path.resolve(config.FACEBOOK_SESSION_ROOT, `${safeSlug}-${account.id}`);
    const authPath = path.join(sessionDir, "auth.json");
    mkdirSync(sessionDir, { recursive: true });

    try {
      const { chromium } = await import("playwright");
      const context = await chromium.launchPersistentContext(sessionDir, {
        headless: false,
        args: ["--no-sandbox"],
        viewport: { width: 1366, height: 900 }
      });
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 60_000 });

      const session: BrowserLoginSession = {
        id: sessionId,
        platform: "facebook",
        accountId: id,
        sessionDir,
        authPath,
        status: "pending",
        createdAt: Date.now(),
        browserContext: context,
        browserPid: undefined
      };
      browserLoginSessions.set(sessionId, session);

      context.on("close", () => {
        const current = browserLoginSessions.get(sessionId);
        if (current && current.status === "pending") {
          current.status = "cancelled";
          current.browserContext = undefined;
          browserLoginSessions.set(sessionId, current);
        }
      });

      return ok({
        ...(await buildBrowserLoginPayload(session)),
        message: "Đã mở trình duyệt. Hãy đăng nhập Facebook thủ công rồi bấm Hoàn tất trong UI."
      });
    } catch (error) {
      rmSync(sessionDir, { recursive: true, force: true });
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send(fail("FACEBOOK_BROWSER_LOGIN_START_FAILED", message));
    }
  });

  app.get("/facebook/browser-login/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = browserLoginSessions.get(sessionId);
    if (!session) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy phiên đăng nhập Facebook."));
    return ok(await buildBrowserLoginPayload(session));
  });

  app.post("/facebook/browser-login/:sessionId/complete", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = browserLoginSessions.get(sessionId);
    if (!session) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy phiên đăng nhập Facebook."));
    if (!session.browserContext) return reply.code(400).send(fail("SESSION_CLOSED", "Trình duyệt đăng nhập đã đóng trước khi hoàn tất."));

    try {
      await session.browserContext.storageState({ path: session.authPath });
      await prisma.targetAccount.update({
        where: { id: session.accountId },
        data: {
          credentials: {
            ...((await prisma.targetAccount.findUnique({ where: { id: session.accountId } }))?.credentials as Record<string, unknown> ?? {}),
            authPath: session.authPath,
            sessionDir: session.sessionDir
          }
        }
      });
      await session.browserContext.close();
      session.status = "completed";
      session.browserContext = undefined;
      browserLoginSessions.set(sessionId, session);

      return ok({
        ...(await buildBrowserLoginPayload(session)),
        message: "Đã lưu session Facebook vào tài khoản."
      });
    } catch (error) {
      session.status = "failed";
      browserLoginSessions.set(sessionId, session);
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).send(fail("FACEBOOK_BROWSER_LOGIN_COMPLETE_FAILED", message));
    }
  });

  app.post("/facebook/browser-login/:sessionId/cancel", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = browserLoginSessions.get(sessionId);
    if (!session) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy phiên đăng nhập Facebook."));

    if (session.browserContext) {
      await session.browserContext.close().catch(() => undefined);
    }
    session.status = "cancelled";
    session.browserContext = undefined;
    browserLoginSessions.set(sessionId, session);
    return ok(await buildBrowserLoginPayload(session));
  });

  const registerGenericBrowserLogin = (platform: BrowserLoginPlatform, homeUrl: string, sessionRoot: string) => {
    app.post(`/${platform}/accounts/:id/browser-login/start`, async (request, reply) => {
      const { id } = request.params as { id: string };
      const account = await prisma.targetAccount.findUnique({ where: { id } });
      if (!account || account.platform !== platform) {
        return reply.code(404).send(fail("NOT_FOUND", `Không tìm thấy tài khoản ${platform}.`));
      }

      const existing = Array.from(browserLoginSessions.values()).find((session) => session.accountId === id && session.platform === platform && session.status === "pending");
      if (existing) {
        return ok({ ...(await buildBrowserLoginPayload(existing)), message: `Đã có phiên đăng nhập ${platform} đang mở cho tài khoản này.` });
      }

      const sessionId = randomUUID();
      const safeSlug = account.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || account.id;
      const sessionDir = path.resolve(sessionRoot, `${safeSlug}-${account.id}`);
      const authPath = path.join(sessionDir, "auth.json");
      mkdirSync(sessionDir, { recursive: true });

      try {
        const { chromium } = await import("playwright");
        const context = await chromium.launchPersistentContext(sessionDir, { headless: false, args: ["--no-sandbox"], viewport: { width: 1366, height: 900 } });
        const page = context.pages()[0] ?? (await context.newPage());
        await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

        const session: BrowserLoginSession = {
          id: sessionId,
          platform,
          accountId: id,
          sessionDir,
          authPath,
          status: "pending",
          createdAt: Date.now(),
          browserContext: context,
          browserPid: undefined
        };
        browserLoginSessions.set(sessionId, session);

        context.on("close", () => {
          const current = browserLoginSessions.get(sessionId);
          if (current && current.status === "pending") {
            current.status = "cancelled";
            current.browserContext = undefined;
            browserLoginSessions.set(sessionId, current);
          }
        });

        return ok({ ...(await buildBrowserLoginPayload(session)), message: `Đã mở trình duyệt ${platform}. Hãy đăng nhập thủ công rồi bấm hoàn tất trong UI.` });
      } catch (error) {
        rmSync(sessionDir, { recursive: true, force: true });
        const message = error instanceof Error ? error.message : String(error);
        return reply.code(500).send(fail(`${platform.toUpperCase()}_BROWSER_LOGIN_START_FAILED`, message));
      }
    });

    app.get(`/${platform}/browser-login/:sessionId`, async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const session = browserLoginSessions.get(sessionId);
      if (!session || session.platform !== platform) return reply.code(404).send(fail("NOT_FOUND", `Không tìm thấy phiên đăng nhập ${platform}.`));
      return ok(await buildBrowserLoginPayload(session));
    });

    app.post(`/${platform}/browser-login/:sessionId/complete`, async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const session = browserLoginSessions.get(sessionId);
      if (!session || session.platform !== platform) return reply.code(404).send(fail("NOT_FOUND", `Không tìm thấy phiên đăng nhập ${platform}.`));
      if (!session.browserContext) return reply.code(400).send(fail("SESSION_CLOSED", "Trình duyệt đăng nhập đã đóng trước khi hoàn tất."));

      try {
        await session.browserContext.storageState({ path: session.authPath });
        await prisma.targetAccount.update({
          where: { id: session.accountId },
          data: {
            credentials: {
              ...((await prisma.targetAccount.findUnique({ where: { id: session.accountId } }))?.credentials as Record<string, unknown> ?? {}),
              authPath: session.authPath,
              sessionDir: session.sessionDir
            }
          }
        });
        await session.browserContext.close();
        session.status = "completed";
        session.browserContext = undefined;
        browserLoginSessions.set(sessionId, session);
        return ok({ ...(await buildBrowserLoginPayload(session)), message: `Đã lưu session ${platform} vào tài khoản.` });
      } catch (error) {
        session.status = "failed";
        browserLoginSessions.set(sessionId, session);
        const message = error instanceof Error ? error.message : String(error);
        return reply.code(500).send(fail(`${platform.toUpperCase()}_BROWSER_LOGIN_COMPLETE_FAILED`, message));
      }
    });

    app.post(`/${platform}/browser-login/:sessionId/cancel`, async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      const session = browserLoginSessions.get(sessionId);
      if (!session || session.platform !== platform) return reply.code(404).send(fail("NOT_FOUND", `Không tìm thấy phiên đăng nhập ${platform}.`));
      if (session.browserContext) await session.browserContext.close().catch(() => undefined);
      session.status = "cancelled";
      session.browserContext = undefined;
      browserLoginSessions.set(sessionId, session);
      return ok(await buildBrowserLoginPayload(session));
    });
  };

  registerGenericBrowserLogin("instagram", "https://www.instagram.com/", config.INSTAGRAM_SESSION_ROOT);
  registerGenericBrowserLogin("threads", "https://www.threads.net/", config.THREADS_SESSION_ROOT);
  registerGenericBrowserLogin("x", "https://x.com/home", config.X_SESSION_ROOT);
}

function registerFacebookRoutes(app: FastifyInstance) {
  app.post("/uploads/manual", async (request, reply) => {
    const part = await request.file();
    if (!part) return reply.code(400).send(fail("FILE_REQUIRED", "Cần chọn file để upload."));
    const saved = await saveUploadedFile(part);
    if (!saved) return reply.code(500).send(fail("UPLOAD_FAILED", "Không thể lưu file upload."));

    const validationError = validateUploadedFile(saved.mimeType, saved.fileSize);
    if (validationError) {
      rmSync(saved.localPath, { force: true });
      return reply.code(400).send(fail("UPLOAD_INVALID", validationError));
    }

    return ok({ file: saved });
  });

  // ── Campaigns ────────────────────────────────────────────────────────────────

  app.get("/facebook/campaigns", async () => {
    const campaigns = await prisma.fbCampaign.findMany({
      include: { _count: { select: { posts: true } } },
      orderBy: { createdAt: "desc" }
    });
    return ok({ campaigns });
  });

  app.post("/facebook/campaigns", async (request) => {
    const body = request.body as AnyBody;
    const campaign = await prisma.fbCampaign.create({
      data: {
        name: String(body.name),
        description: body.description ? String(body.description) : undefined,
        postsPerDay: Number(body.postsPerDay ?? 5),
        startDate: new Date(String(body.startDate))
      }
    });
    return ok({ campaign });
  });

  app.get("/facebook/campaigns/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const campaign = await prisma.fbCampaign.findUnique({
      where: { id },
      include: { posts: { include: { media: true, targets: { include: { targetAccount: true } }, comments: true, executions: true } } }
    });
    if (!campaign) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy chiến dịch."));
    return ok({ campaign });
  });

  app.put("/facebook/campaigns/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    const data: AnyBody = {};
    if (body.name !== undefined) data.name = String(body.name);
    if (body.description !== undefined) data.description = String(body.description);
    if (body.postsPerDay !== undefined) data.postsPerDay = Number(body.postsPerDay);
    if (body.startDate !== undefined) data.startDate = new Date(String(body.startDate));
    if (body.status !== undefined) data.status = String(body.status);
    const campaign = await prisma.fbCampaign.update({ where: { id }, data }).catch(() => null);
    if (!campaign) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy chiến dịch."));
    return ok({ campaign });
  });

  app.delete("/facebook/campaigns/:id", async (request) => {
    const { id } = request.params as { id: string };
    await prisma.fbCampaign.delete({ where: { id } });
    return ok({ success: true });
  });

  // Schedule: distribute posts across days and enqueue delayed BullMQ jobs
  app.post("/facebook/campaigns/:id/schedule", async (request, reply) => {
    const { id } = request.params as { id: string };
    const campaign = await prisma.fbCampaign.findUnique({
      where: { id },
      include: { posts: { include: { targets: true }, orderBy: { createdAt: "asc" } } }
    });
    if (!campaign) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy chiến dịch."));
    if (campaign.status !== "draft") return reply.code(400).send(fail("INVALID_STATUS", "Chỉ có thể lên lịch chiến dịch ở trạng thái draft."));

    const { postsPerDay, startDate, posts } = campaign;
    let scheduled = 0;

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const dayOffset = Math.floor(i / postsPerDay);
      const postDate = new Date(startDate);
      postDate.setDate(postDate.getDate() + dayOffset);

      for (const target of post.targets) {
        const scheduledAt = resolveScheduledAt(postDate, target.scheduleMode, target.fixedTime, target.windowStart, target.windowEnd);

        await prisma.fbPostTarget.update({ where: { id: target.id }, data: { scheduledAt, status: "scheduled" } });
        await prisma.fbPost.update({ where: { id: post.id }, data: { scheduledAt, status: "scheduled" } });
        await app.workerCore.scheduleFbPost(target.id, scheduledAt);
        scheduled++;
      }
    }

    await prisma.fbCampaign.update({ where: { id }, data: { status: "active" } });
    return ok({ scheduled });
  });

  // ── Posts ─────────────────────────────────────────────────────────────────────

  app.get("/facebook/posts", async (request) => {
    const query = request.query as AnyBody;
    const where: AnyBody = {};
    if (query.campaignId) where.campaignId = String(query.campaignId);
    if (query.status) where.status = String(query.status);
    const posts = await prisma.fbPost.findMany({
      where,
      include: { media: true, targets: { include: { targetAccount: true } }, comments: true, _count: { select: { executions: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(query.limit ?? 50), 200)
    });
    return ok({ posts });
  });

  app.post("/facebook/posts", async (request) => {
    const body = request.body as AnyBody;
    const type = String(body.type ?? "feed");
    if (!["feed", "story", "reel"].includes(type)) {
      return { statusCode: 400, ...fail("INVALID_TYPE", "type phải là feed, story hoặc reel.") };
    }

    const post = await prisma.fbPost.create({
      data: {
        campaignId: body.campaignId ? String(body.campaignId) : undefined,
        type,
        caption: body.caption ? String(body.caption) : undefined,
        media: { create: (Array.isArray(body.media) ? body.media : []).map((m: AnyBody, idx: number) => ({ localPath: String(m.localPath), mimeType: String(m.mimeType ?? "image/jpeg"), sortOrder: idx })) },
        targets: {
          create: (Array.isArray(body.targets) ? body.targets : []).map((t: AnyBody) => ({
            targetAccountId: String(t.targetAccountId),
            scheduleMode: String(t.scheduleMode ?? "fixed"),
            fixedTime: t.fixedTime ? new Date(String(t.fixedTime)) : undefined,
            windowStart: t.windowStart ? String(t.windowStart) : undefined,
            windowEnd: t.windowEnd ? String(t.windowEnd) : undefined
          }))
        },
        comments: {
          create: (Array.isArray(body.comments) ? body.comments : []).map((c: AnyBody, idx: number) => ({
            text: String(c.text),
            delayMinutes: Number(c.delayMinutes ?? 5),
            sortOrder: idx
          }))
        }
      },
      include: { media: true, targets: true, comments: true }
    });
    return ok({ post });
  });

  app.get("/facebook/posts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const post = await prisma.fbPost.findUnique({
      where: { id },
      include: { media: true, targets: { include: { targetAccount: true } }, comments: true, executions: true }
    });
    if (!post) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy bài đăng."));
    return ok({ post });
  });

  app.put("/facebook/posts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    const data: AnyBody = {};
    if (body.caption !== undefined) data.caption = String(body.caption);
    if (body.status !== undefined) data.status = String(body.status);
    const post = await prisma.fbPost.update({ where: { id }, data }).catch(() => null);
    if (!post) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy bài đăng."));
    return ok({ post });
  });

  app.post("/facebook/posts/:id/queue", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    const mode = String(body.mode ?? "now");
    const post = await prisma.fbPost.findUnique({ where: { id }, include: { targets: true } });
    if (!post) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy bài đăng."));
    if (!post.targets.length) return reply.code(400).send(fail("TARGET_REQUIRED", "Cần chọn ít nhất một tài khoản đăng."));

    const scheduleByTarget = Array.isArray(body.targets) ? body.targets : [];
    let queued = 0;
    let lastScheduledAt: Date | null = null;

    for (const target of post.targets) {
      const targetInput = scheduleByTarget.find((item: AnyBody) => String(item.targetId) === target.targetAccountId);
      const targetMode = String(targetInput?.mode ?? mode ?? "now");
      const scheduledAt = targetMode === "schedule" ? new Date(String(targetInput?.scheduledAt ?? body.scheduledAt)) : new Date();
      if (Number.isNaN(scheduledAt.getTime())) {
        return reply.code(400).send(fail("INVALID_SCHEDULE", `Thời gian hẹn đăng không hợp lệ cho tài khoản ${target.targetAccountId}.`));
      }

      await prisma.fbPostTarget.update({
        where: { id: target.id },
        data: {
          status: "scheduled",
          scheduledAt,
          scheduleMode: "fixed",
          fixedTime: scheduledAt
        }
      });
      await app.workerCore.scheduleFbPost(target.id, scheduledAt);
      queued += 1;
      lastScheduledAt = scheduledAt;
    }

    await prisma.fbPost.update({ where: { id }, data: { status: "scheduled", scheduledAt: lastScheduledAt ?? new Date() } });
    return ok({ queued, scheduledAt: lastScheduledAt?.toISOString() ?? new Date().toISOString(), mode });
  });

  app.delete("/facebook/posts/:id", async (request) => {
    const { id } = request.params as { id: string };
    await prisma.fbPost.delete({ where: { id } });
    return ok({ success: true });
  });

  // Batch import: simplified Excel rows. UI must provide type/targets/schedule config.
  app.post("/facebook/campaigns/:id/import", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    const campaign = await prisma.fbCampaign.findUnique({ where: { id } });
    if (!campaign) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy chiến dịch."));

    const items: AnyBody[] = Array.isArray(body.posts) ? body.posts : [];
    const type = String(body.type ?? "feed");
    const targets: AnyBody[] = Array.isArray(body.targets) ? body.targets : [];

    if (items.length === 0) return reply.code(400).send(fail("EMPTY_IMPORT", "Không có bài nào để import."));
    if (items.length > 100) return reply.code(400).send(fail("LIMIT_EXCEEDED", "Tối đa 100 bài mỗi lần import."));
    if (!['feed', 'story', 'reel'].includes(type)) return reply.code(400).send(fail("INVALID_TYPE", "type phải là feed, story hoặc reel."));
    if (targets.length === 0) return reply.code(400).send(fail("TARGETS_REQUIRED", "Phải cấu hình ít nhất 1 tài khoản đích trên UI."));

    const created: Array<{ id: string }> = [];
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const post = await prisma.fbPost.create({
        data: {
          campaignId: id,
          type,
          caption: item.caption ? String(item.caption) : item.content ? String(item.content) : undefined,
          media: {
            create: (Array.isArray(item.media) ? item.media : [])
              .map((m: AnyBody, i: number) => ({
                localPath: String(m.localPath ?? m.path ?? m),
                mimeType: String(m.mimeType ?? "image/jpeg"),
                sortOrder: i
              }))
          },
          targets: {
            create: targets.map((t: AnyBody) => ({
              targetAccountId: String(t.targetAccountId),
              scheduleMode: String(t.scheduleMode ?? "fixed"),
              fixedTime: t.fixedTime ? new Date(String(t.fixedTime)) : undefined,
              windowStart: t.windowStart ? String(t.windowStart) : undefined,
              windowEnd: t.windowEnd ? String(t.windowEnd) : undefined
            }))
          },
          comments: {
            create: (Array.isArray(item.comments) ? item.comments : item.comment ? [item.comment] : []).map((c: AnyBody, i: number) => ({
              text: String(typeof c === 'string' ? c : c.text),
              delayMinutes: Number(typeof c === 'string' ? 5 : c.delayMinutes ?? 5),
              sortOrder: i
            }))
          }
        }
      });
      created.push({ id: post.id });
    }

    return ok({ imported: created.length, postIds: created.map((p) => p.id) });
  });
}

// ── Schedule helpers ───────────────────────────────────────────────────────────

function resolveScheduledAt(date: Date, mode: string, fixedTime: Date | null, windowStart: string | null, windowEnd: string | null): Date {
  // All scheduling uses Asia/Saigon timezone (GMT+7)
  const saigonDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Saigon' }));

  if (mode === "random" && windowStart && windowEnd) {
    const [startH, startM] = windowStart.split(":").map(Number);
    const [endH, endM] = windowEnd.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const randomMinutes = startMinutes + Math.floor(Math.random() * (endMinutes - startMinutes));
    saigonDate.setHours(Math.floor(randomMinutes / 60), randomMinutes % 60, 0, 0);
    return saigonDate;
  }

  if (fixedTime) {
    const fixedSaigon = new Date(fixedTime.toLocaleString('en-US', { timeZone: 'Asia/Saigon' }));
    saigonDate.setHours(fixedSaigon.getHours(), fixedSaigon.getMinutes(), 0, 0);
    return saigonDate;
  }

  // Default: 9:00 AM Saigon time
  saigonDate.setHours(9, 0, 0, 0);
  return saigonDate;
}

// ── Repost API & Contract Helpers ──────────────────────────────────────────────

export function omitTelegramSession(credentials: any) {
  if (!credentials) return {};
  const { sessionString, ...rest } = credentials;
  return rest;
}

export function isSupportedAccountPlatform(platform: string) {
  return ["telegram", "x", "threads", "instagram", "facebook", "zalo-personal"].includes(platform);
}

function isRealtimeSourcePlatform(platform: string) {
  return ["telegram", "zalo-personal"].includes(platform);
}

const UNSUPPORTED_PLATFORM = "Nền tảng không được hỗ trợ.";

// contract check: _existingCredentials: current.credentials

type ChannelAccountRole = "source" | "target";

type ResolvedChannelOptionAccount = {
  accountKind: ChannelAccountRole;
  accountId: string;
  platform: string;
  name: string;
  handle: string | null;
  config: unknown;
  credentials: unknown;
  lookupAccountIds: string[];
};

function toPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sameLoginAccountWhere(account: { platform: string; name: string; handle: string | null }) {
  const OR: Prisma.TargetAccountWhereInput[] = [{ name: account.name }];
  if (account.handle) OR.push({ handle: account.handle });
  return { platform: account.platform, OR };
}

function sameSourceLoginAccountWhere(account: { platform: string; name: string; handle: string | null }) {
  const OR: Prisma.SourceAccountWhereInput[] = [{ name: account.name }];
  if (account.handle) OR.push({ handle: account.handle });
  return { platform: account.platform, OR };
}

async function resolveChannelOptionAccount(accountKind: string, accountId: string): Promise<ResolvedChannelOptionAccount | null> {
  if (accountKind === "source") {
    const source = await prisma.sourceAccount.findUnique({ where: { id: accountId } });
    if (!source) return null;
    return {
      accountKind: "source",
      accountId: source.id,
      platform: source.platform,
      name: source.name,
      handle: source.handle,
      config: source.config,
      credentials: source.credentials,
      lookupAccountIds: [source.id]
    };
  }

  if (accountKind === "target") {
    const target = await prisma.targetAccount.findUnique({ where: { id: accountId } });
    if (!target) return null;
    const linkedSource = target.linkedSourceAccountId
      ? await prisma.sourceAccount.findUnique({ where: { id: target.linkedSourceAccountId } })
      : null;
    return {
      accountKind: "target",
      accountId: target.id,
      platform: linkedSource?.platform ?? target.platform,
      name: target.name,
      handle: linkedSource?.handle ?? target.handle,
      config: linkedSource?.config ?? target.config,
      credentials: linkedSource?.credentials ?? target.credentials,
      lookupAccountIds: linkedSource ? [target.id, linkedSource.id] : [target.id]
    };
  }

  return null;
}

async function findReusableAccount(role: string, accountKind: string, accountId: string) {
  if (role === "source") {
    if (accountKind === "source") {
      const source = await prisma.sourceAccount.findUnique({ where: { id: accountId } });
      return source ? { accountId: source.id, platform: source.platform } : null;
    }
    const target = await prisma.targetAccount.findUnique({ where: { id: accountId } });
    if (!target) return null;
    if (target.linkedSourceAccountId) {
      const source = await prisma.sourceAccount.findUnique({ where: { id: target.linkedSourceAccountId } });
      if (source) return { accountId: source.id, platform: source.platform };
    }
    const existing = await prisma.sourceAccount.findFirst({ where: sameSourceLoginAccountWhere(target), orderBy: { updatedAt: "desc" } });
    if (existing) {
      if (!target.linkedSourceAccountId) {
        await prisma.targetAccount.update({ where: { id: target.id }, data: { linkedSourceAccountId: existing.id } }).catch(() => null);
      }
      return { accountId: existing.id, platform: existing.platform };
    }
    const source = await prisma.sourceAccount.create({
      data: {
        platform: target.platform,
        name: target.name,
        handle: target.handle,
        isActive: target.isActive,
        health: target.health,
        credentials: target.credentials as Prisma.InputJsonValue,
        config: target.config as Prisma.InputJsonValue
      }
    });
    await prisma.targetAccount.update({ where: { id: target.id }, data: { linkedSourceAccountId: source.id } }).catch(() => null);
    return { accountId: source.id, platform: source.platform };
  }

  if (role === "target") {
    if (accountKind === "target") {
      const target = await prisma.targetAccount.findUnique({ where: { id: accountId } });
      return target ? { accountId: target.id, platform: target.platform } : null;
    }
    const source = await prisma.sourceAccount.findUnique({ where: { id: accountId } });
    if (!source) return null;
    const existing = await prisma.targetAccount.findFirst({
      where: { OR: [{ linkedSourceAccountId: source.id }, sameLoginAccountWhere(source)] },
      orderBy: { updatedAt: "desc" }
    });
    if (existing) {
      if (!existing.linkedSourceAccountId) {
        await prisma.targetAccount.update({ where: { id: existing.id }, data: { linkedSourceAccountId: source.id } }).catch(() => null);
      }
      return { accountId: existing.id, platform: existing.platform };
    }
    const target = await prisma.targetAccount.create({
      data: {
        platform: source.platform,
        name: source.name,
        handle: source.handle,
        isActive: source.isActive,
        health: source.health,
        credentials: {},
        config: {},
        linkedSourceAccountId: source.id
      }
    });
    return { accountId: target.id, platform: target.platform };
  }

  return null;
}

async function pruneRepostSourceHistory() {
  const oldRows = await prisma.content.findMany({
    where: {
      deletedAt: null,
      sourceChannelId: { not: null }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: REPOST_SOURCE_HISTORY_MAX_ITEMS,
    take: 10000,
    select: { id: true }
  });

  if (oldRows.length === 0) return;
  await prisma.content.deleteMany({
    where: {
      id: { in: oldRows.map((row) => row.id) },
      status: { notIn: ["publishing"] }
    }
  });
}

function mapRepostSourceHistoryItem(content: AnyBody) {
  const metadata = content.metadata && typeof content.metadata === "object" && !Array.isArray(content.metadata)
    ? content.metadata as Record<string, unknown>
    : {};
  const contentPackage = metadata.contentPackage && typeof metadata.contentPackage === "object" && !Array.isArray(metadata.contentPackage)
    ? metadata.contentPackage as Record<string, unknown>
    : {};
  const review = metadata.review && typeof metadata.review === "object" && !Array.isArray(metadata.review)
    ? metadata.review as Record<string, unknown>
    : {};
  const ai = metadata.ai && typeof metadata.ai === "object" && !Array.isArray(metadata.ai)
    ? metadata.ai as Record<string, unknown>
    : {};
  const aiAnalysis = ai.analysis && typeof ai.analysis === "object" && !Array.isArray(ai.analysis)
    ? ai.analysis as Record<string, unknown>
    : {};
  const rawMessages = Array.isArray(contentPackage.rawMessages) ? contentPackage.rawMessages : [];
  const rawMessageIds = Array.isArray(contentPackage.rawMessageIds) ? contentPackage.rawMessageIds : [];

  return {
    id: content.id,
    code: content.code,
    platform: content.platform,
    sourceId: content.sourceId,
    sourceName: content.source?.name ?? null,
    sourceChannelId: content.sourceChannelId,
    sourceChannelName: content.sourceChannel?.name ?? null,
    sourceChannelExternalId: content.sourceChannel?.externalId ?? null,
    author: content.author,
    originalText: content.originalText,
    draftText: content.draftText,
    finalText: content.finalText,
    status: content.status,
    savedReason: content.savedReason,
    lastError: content.lastError,
    postedAt: content.postedAt?.toISOString?.() ?? null,
    createdAt: content.createdAt?.toISOString?.() ?? null,
    updatedAt: content.updatedAt?.toISOString?.() ?? null,
    package: {
      rawMessageCount: rawMessages.length || rawMessageIds.length || 1,
      rawMessageIds: rawMessageIds.map(String),
      status: typeof contentPackage.status === "string" ? contentPackage.status : null,
      confidence: typeof contentPackage.confidence === "number" ? contentPackage.confidence : null,
      productCount: typeof contentPackage.productCount === "number" ? contentPackage.productCount : null,
      groupingReason: typeof contentPackage.groupingReason === "string" ? contentPackage.groupingReason : null,
      linkCount: typeof contentPackage.linkCount === "number" ? contentPackage.linkCount : content.links?.length ?? 0,
      mediaCount: typeof contentPackage.mediaCount === "number" ? contentPackage.mediaCount : content.media?.length ?? 0,
      rawMessages
    },
    decision: {
      primaryCategory: review.primaryCategory ?? aiAnalysis.primaryCategory ?? null,
      categoryConfidence: review.categoryConfidence ?? aiAnalysis.categoryConfidence ?? null,
      reason: review.routingHoldReason ?? review.heldReason ?? aiAnalysis.reason ?? content.savedReason ?? content.lastError ?? null,
      matchedTargetCount: Array.isArray(review.matchedTargetIds) ? review.matchedTargetIds.length : 0,
      wouldPublishTargetCount: Array.isArray(review.wouldPublishTargets) ? review.wouldPublishTargets.length : 0
    },
    media: (content.media ?? []).map((media: AnyBody) => ({
      id: media.id,
      type: media.type,
      mimeType: media.mimeType,
      sourceUrl: media.sourceUrl,
      localPath: media.localPath,
      cloudinaryUrl: media.cdnUrl
    })),
    links: (content.links ?? []).map((link: AnyBody) => ({
      id: link.id,
      originalUrl: link.originalUrl,
      convertedUrl: link.convertedUrl,
      network: link.network,
      status: link.status,
      error: link.error
    })),
    publishAttempts: (content.publishAttempts ?? []).map((attempt: AnyBody) => ({
      id: attempt.id,
      status: attempt.status,
      targetName: attempt.targetChannel?.name ?? attempt.target?.name ?? null,
      resultUrl: attempt.resultUrl,
      error: attempt.error,
      createdAt: attempt.createdAt?.toISOString?.() ?? null,
      completedAt: attempt.completedAt?.toISOString?.() ?? null
    }))
  };
}

function registerRepostApiRoutes(app: FastifyInstance) {
  // GET /connected-accounts
  app.get("/connected-accounts", async () => {
    const [sources, targets] = await Promise.all([
      prisma.sourceAccount.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, platform: true, name: true, handle: true, health: true, isActive: true, lastCrawledAt: true, createdAt: true }
      }),
      prisma.targetAccount.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, platform: true, name: true, handle: true, health: true, isActive: true, createdAt: true }
      })
    ]);
    return ok({
      accounts: [
        ...sources.map((account) => ({
          id: account.id,
          accountKind: "source" as const,
          platform: account.platform,
          name: account.name,
          handle: account.handle,
          health: account.health,
          isActive: account.isActive,
          lastCrawledAt: account.lastCrawledAt?.toISOString() ?? null,
          createdAt: account.createdAt.toISOString()
        })),
        ...targets.map((account) => ({
          id: account.id,
          accountKind: "target" as const,
          platform: account.platform,
          name: account.name,
          handle: account.handle,
          health: account.health,
          isActive: account.isActive,
          createdAt: account.createdAt.toISOString()
        }))
      ]
    });
  });

  // GET /channel-options
  app.get("/channel-options", async (request, reply) => {
    const query = request.query as AnyBody;
    const accountKind = String(query.accountKind ?? "");
    const accountId = String(query.accountId ?? "");

    if (!["source", "target"].includes(accountKind) || !accountId) {
      return reply.code(400).send(fail("BAD_REQUEST", "Thiếu accountKind hoặc accountId."));
    }

    const account = await resolveChannelOptionAccount(accountKind, accountId);

    if (!account) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy tài khoản."));

    const knownChannels = await prisma.platformChannel.findMany({
      where: { accountId: { in: account.lookupAccountIds } },
      select: { externalId: true, name: true, channelType: true }
    });
    const knownNameByExternalId = new Map(knownChannels.map((channel) => [channel.externalId, channel.name]));
    const allKnownRefs = new Set(knownChannels.map((channel) => channel.externalId));
    const options = new Map<string, { externalId: string; name: string; channelType: string; reference?: string }>();
    const addOption = (externalId: unknown, name?: unknown, channelType = "group", reference?: string) => {
      if (typeof externalId !== "string" && typeof externalId !== "number") return;
      const id = String(externalId).trim();
      if (!id) return;
      if (knownNameByExternalId.has(id)) return;
      const normalizedRef = reference?.startsWith("@") ? reference.slice(1) : reference;
      if (normalizedRef && allKnownRefs.has(`@${normalizedRef}`)) return;
      options.set(id, {
        externalId: id,
        name: typeof name === "string" && name.trim() ? name.trim() : id,
        channelType,
        ...(reference ? { reference } : {})
      });
    };

    const config = account.config && typeof account.config === "object" && !Array.isArray(account.config)
      ? account.config as Record<string, unknown>
      : {};

    if (account.platform === "zalo-personal") {
      try {
        const groups = await listZaloGroups({
          id: account.accountId,
          platform: "zalo-personal",
          name: account.name,
          handle: account.handle,
          credentials: toPlainRecord(account.credentials),
          config: toPlainRecord(account.config)
        });
        for (const group of groups) addOption(group.id, group.name, "group");
      } catch {
        // Fall back to saved threadIds/known channels when the current session cannot list groups.
      }
      addOption(config.threadId, knownNameByExternalId.get(String(config.threadId ?? "")) ?? account.name, "group");
      const threadIds = Array.isArray(config.threadIds) ? config.threadIds : [];
      for (const threadId of threadIds) addOption(threadId, undefined, "group");
    }

    if (account.platform === "telegram") {
      try {
        const dialogs = await listTelegramDialogs(toPlainRecord(account.credentials));
        for (const dialog of dialogs) {
          if (!dialog.reference.startsWith("@")) continue;
          addOption(dialog.reference, dialog.name, dialog.type);
        }
      } catch {
        // Fall back to saved sources when the current session cannot list dialogs.
      }
      const sources = Array.isArray(config.sources) ? config.sources : [];
      for (const source of sources) {
        if (typeof source === "string" && source.startsWith("@")) addOption(source, undefined, "channel");
        if (typeof source === "number") continue;
        if (source && typeof source === "object" && !Array.isArray(source)) {
          const item = source as Record<string, unknown>;
          const username = String(item.externalId ?? item.handle ?? item.username ?? item.source ?? "");
          if (username.startsWith("@")) addOption(username, item.name ?? item.title, "channel");
        }
      }
    }

    return ok({ channels: Array.from(options.values()) });
  });

  // GET /channels
  app.get("/channels", async (request) => {
    const query = request.query as AnyBody;
    const role = String(query.role ?? "source");
    const channels = await prisma.platformChannel.findMany({
      where: { accountKind: role },
      orderBy: { createdAt: "desc" }
    });
    return ok({ channels });
  });

  // POST /channels/bulk
  app.post("/channels/bulk", async (request, reply) => {
    const body = request.body as AnyBody;
    const { role, accountKind, accountId, channels } = body;
    const resolvedAccount = await findReusableAccount(String(role), String(accountKind), String(accountId));
    if (!resolvedAccount) {
      return reply.code(404).send(fail("ACCOUNT_NOT_FOUND", "Không tìm thấy tài khoản đăng nhập để thêm kênh."));
    }

    const created = [];
    for (const channel of channels) {
      const record = await prisma.platformChannel.upsert({
        where: {
          accountKind_accountId_externalId: {
            accountKind: String(role),
            accountId: resolvedAccount.accountId,
            externalId: String(channel.externalId)
          }
        },
        create: {
          accountKind: String(role),
          accountId: resolvedAccount.accountId,
          platform: resolvedAccount.platform,
          externalId: String(channel.externalId),
          name: String(channel.name),
          channelType: String(channel.channelType ?? "group"),
          isSource: role === "source",
          isTarget: role === "target",
          isActive: true
        },
        update: {
          name: String(channel.name),
          channelType: String(channel.channelType ?? "group")
        }
      });
      created.push(record);
    }
    return ok({ success: true, count: created.length });
  });

  // PUT /channels/:id
  app.put("/channels/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    const updated = await prisma.platformChannel.update({
      where: { id },
      data: {
        filterMode: body.filterMode !== undefined ? String(body.filterMode) : undefined,
        acceptedCategories: body.acceptedCategories !== undefined ? body.acceptedCategories : undefined,
        allowGeneralContent: body.allowGeneralContent !== undefined ? Boolean(body.allowGeneralContent) : undefined,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined
      }
    }).catch(() => null);
    if (!updated) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy kênh."));
    return ok({ channel: updated });
  });

  // DELETE /channels/:id
  app.delete("/channels/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await prisma.platformChannel.delete({ where: { id } }).catch(() => null);
    if (!deleted) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy kênh."));
    return ok({ success: true });
  });

  // POST /channels/:id/test-crawl
  app.post("/channels/:id/test-crawl", async (request, reply) => {
    const { id } = request.params as { id: string };
    const channel = await prisma.platformChannel.findUnique({ where: { id } });
    if (!channel) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy kênh."));
    if (channel.accountKind === "source" && isRealtimeSourcePlatform(channel.platform)) {
      return ok({ message: "Kênh nguồn này đang chạy bằng realtime listener; không tạo job polling." });
    }
    await app.workerCore.triggerCrawl(channel.accountId, "admin");
    return ok({ message: "Đã tạo job lấy tin. Xem tiến độ ở Worker jobs / Logs, chọn queue Crawl." });
  });

  // POST /channels/:id/test-connection - Kiểm tra kết nối bằng cách lấy tin nhắn cuối cùng của group
  app.post("/channels/:id/test-connection", async (request, reply) => {
    const { id } = request.params as { id: string };
    const channel = await prisma.platformChannel.findUnique({ where: { id } });
    if (!channel) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy kênh."));

    // Chỉ hỗ trợ Zalo personal cho việc kiểm tra kết nối
    if (channel.platform !== "zalo-personal") {
      return ok({
        connected: false,
        message: "Chỉ hỗ trợ kiểm tra kết nối Zalo cá nhân."
      });
    }

    // Lấy account để tạo adapter account
    const account = channel.accountKind === "source"
      ? await prisma.sourceAccount.findUnique({ where: { id: channel.accountId } })
      : await prisma.targetAccount.findUnique({ where: { id: channel.accountId } });

    if (!account) {
      return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy tài khoản."));
    }

    const credentials = (account.credentials ?? {}) as Record<string, unknown>;
    const adapterAccount = {
      id: String(account.id),
      platform: "zalo-personal" as const,
      name: String(account.name),
      handle: account.handle ? String(account.handle) : null,
      credentials,
      config: { ...((account.config ?? {}) as Record<string, unknown>), threadId: channel.externalId }
    };

    const { checkZaloGroupConnection } = await import("@zerun/adapters");
    const result = await checkZaloGroupConnection(adapterAccount, channel.externalId);

    return ok({
      connected: result.connected,
      message: result.connected 
        ? result.warning 
          ? `Kết nối thành công! Nhóm "${result.groupName || 'Unknown'}" có ${result.memberCount ?? 0} thành viên.\n⚠️ ${result.warning}`
          : `Kết nối thành công! Nhóm "${result.groupName || 'Unknown'}" có ${result.memberCount ?? 0} thành viên.`
        : result.error,
      groupName: result.groupName,
      memberCount: result.memberCount,
      lastMessage: result.lastMessage ? {
        content: result.lastMessage.content,
        senderName: result.lastMessage.senderName,
        timestamp: result.lastMessage.timestamp.toISOString(),
        hasMedia: result.lastMessage.hasMedia
      } : undefined,
      warning: result.warning,
      errorCode: result.errorCode
    });
  });

  // GET /repost-flows/source-history
  app.get("/repost-flows/source-history", async (request, reply) => {
    const query = request.query as AnyBody;
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 50);
    const flowId = String(query.flowId ?? "").trim();
    const sourceChannelId = String(query.sourceChannelId ?? "all").trim();
    const status = String(query.status ?? "all").trim();
    const keyword = String(query.keyword ?? "").trim();

    await pruneRepostSourceHistory();

    let flowSourceChannelIds: string[] | null = null;
    if (flowId && flowId !== "all") {
      const flow = await prisma.repostFlow.findUnique({
        where: { id: flowId },
        include: { sources: { select: { channelId: true } } }
      });
      if (!flow) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy flow đăng lại."));
      flowSourceChannelIds = flow.sources.map((source) => source.channelId);
    }

    const where: Prisma.ContentWhereInput = {
      deletedAt: null,
      sourceChannelId: { not: null }
    };

    if (flowSourceChannelIds) {
      where.sourceChannelId = flowSourceChannelIds.length > 0 ? { in: flowSourceChannelIds } : "__no_source_channel__";
    }
    if (sourceChannelId && sourceChannelId !== "all") {
      where.sourceChannelId = flowSourceChannelIds
        ? flowSourceChannelIds.includes(sourceChannelId) ? sourceChannelId : "__no_source_channel__"
        : sourceChannelId;
    }
    if (status && status !== "all") {
      const statuses = status.split(",").map((item) => item.trim()).filter(Boolean);
      if (statuses.length === 1) where.status = statuses[0];
      if (statuses.length > 1) where.status = { in: statuses };
    }
    if (keyword) {
      const contains = { contains: keyword, mode: "insensitive" as const };
      where.OR = [
        { code: contains },
        { originalText: contains },
        { finalText: contains },
        { draftText: contains },
        { author: contains },
        { savedReason: contains },
        { lastError: contains }
      ];
    }

    const [total, statusGroups, contents] = await Promise.all([
      prisma.content.count({ where }),
      prisma.content.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.content.findMany({
        where,
        include: {
          source: { select: { id: true, name: true, platform: true, handle: true } },
          sourceChannel: true,
          media: { orderBy: { createdAt: "asc" } },
          links: { orderBy: { createdAt: "asc" } },
          publishAttempts: {
            orderBy: { createdAt: "desc" },
            include: {
              target: { select: { id: true, name: true, platform: true, handle: true } },
              targetChannel: true
            }
          }
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    const pagination = buildPagination(page, limit, total);
    return ok({
      items: contents.map(mapRepostSourceHistoryItem),
      summary: {
        maxItems: REPOST_SOURCE_HISTORY_MAX_ITEMS,
        statusCounts: Object.fromEntries(statusGroups.map((group) => [group.status, group._count._all]))
      },
      pagination
    }, pagination);
  });

  // GET /repost-flows
  app.get("/repost-flows", async () => {
    const flows = await prisma.repostFlow.findMany({
      include: {
        sources: { include: { channel: true } },
        targets: { include: { channel: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    return ok({
      flows: flows.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        useAI: f.useAI,
        autoPublish: f.autoPublish,
        requireReview: f.requireReview,
        isActive: f.isActive,
        sources: f.sources.map((sl) => ({ channelId: sl.channelId, channel: sl.channel })),
        targets: f.targets.map((tl) => ({ channelId: tl.channelId, channel: tl.channel }))
      }))
    });
  });

  // POST /repost-flows
  app.post("/repost-flows", async (request) => {
    const body = request.body as AnyBody;
    const { name, description, useAI, autoPublish, requireReview, isActive, sourceChannelIds, targetChannelIds } = body;
    const flow = await prisma.$transaction(async (tx) => {
      const f = await tx.repostFlow.create({
        data: {
          name: String(name),
          description: description ? String(description) : null,
          useAI: Boolean(useAI),
          isActive: Boolean(isActive),
          autoPublish: Boolean(autoPublish),
          requireReview: Boolean(requireReview)
        }
      });
      if (Array.isArray(sourceChannelIds) && sourceChannelIds.length > 0) {
        await tx.repostFlowSource.createMany({
          data: sourceChannelIds.map((id) => ({ flowId: f.id, channelId: String(id) }))
        });
      }
      if (Array.isArray(targetChannelIds) && targetChannelIds.length > 0) {
        await tx.repostFlowTarget.createMany({
          data: targetChannelIds.map((id) => ({ flowId: f.id, channelId: String(id) }))
        });
      }
      return f;
    });
    return ok({ flow });
  });

  // PUT /repost-flows/:id
  app.put("/repost-flows/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    const { name, description, useAI, autoPublish, requireReview, isActive, sourceChannelIds, targetChannelIds } = body;
    const flow = await prisma.$transaction(async (tx) => {
      const f = await tx.repostFlow.update({
        where: { id },
        data: {
          name: name !== undefined ? String(name) : undefined,
          description: description !== undefined ? (description ? String(description) : null) : undefined,
          useAI: useAI !== undefined ? Boolean(useAI) : undefined,
          isActive: isActive !== undefined ? Boolean(isActive) : undefined,
          autoPublish: autoPublish !== undefined ? Boolean(autoPublish) : undefined,
          requireReview: requireReview !== undefined ? Boolean(requireReview) : undefined
        }
      });
      if (sourceChannelIds !== undefined) {
        await tx.repostFlowSource.deleteMany({ where: { flowId: id } });
        if (Array.isArray(sourceChannelIds) && sourceChannelIds.length > 0) {
          await tx.repostFlowSource.createMany({
            data: sourceChannelIds.map((cid) => ({ flowId: id, channelId: String(cid) }))
          });
        }
      }
      if (targetChannelIds !== undefined) {
        await tx.repostFlowTarget.deleteMany({ where: { flowId: id } });
        if (Array.isArray(targetChannelIds) && targetChannelIds.length > 0) {
          await tx.repostFlowTarget.createMany({
            data: targetChannelIds.map((cid) => ({ flowId: id, channelId: String(cid) }))
          });
        }
      }
      return f;
    });
    return ok({ flow });
  });

  // DELETE /repost-flows/:id
  app.delete("/repost-flows/:id", async (request) => {
    const { id } = request.params as { id: string };
    await prisma.repostFlow.delete({ where: { id } });
    return ok({ success: true });
  });

  // GET /accounts/:kind/:id/session
  app.get("/accounts/:kind/:id/session", async (request) => {
    const { kind, id } = request.params as { kind: string; id: string };
    const session = await prisma.platformSession.findUnique({
      where: {
        platform_accountKind_accountId: {
          platform: "zalo-personal",
          accountKind: kind,
          accountId: id
        }
      }
    });
    return ok({ session: session ? { status: session.status, data: session.data } : null });
  });

  // POST /accounts/:kind/:id/session/create
  app.post("/accounts/:kind/:id/session/create", async (request) => {
    const { kind, id } = request.params as { kind: string; id: string };
    
    let platform = "zalo-personal";
    if (kind === "source") {
      const acc = await prisma.sourceAccount.findUnique({ where: { id } });
      if (acc) platform = acc.platform;
    } else {
      const acc = await prisma.targetAccount.findUnique({ where: { id } });
      if (acc) platform = acc.platform;
    }

    await prisma.platformSession.upsert({
      where: { platform_accountKind_accountId: { platform, accountKind: kind, accountId: id } },
      create: { platform, accountKind: kind, accountId: id, status: "created", data: { qrReady: false } },
      update: { status: "created", data: { qrReady: false } }
    });
    return ok({ success: true });
  });

  // POST /accounts/:kind/:id/session/zalo-qr
  app.post("/accounts/:kind/:id/session/zalo-qr", async (request) => {
    const { kind, id } = request.params as { kind: string; id: string };
    await prisma.platformSession.upsert({
      where: { platform_accountKind_accountId: { platform: "zalo-personal", accountKind: kind, accountId: id } },
      create: { platform: "zalo-personal", accountKind: kind, accountId: id, status: "login_required", data: { qrReady: false, error: "Chưa có luồng tạo QR Zalo thật." } },
      update: { status: "login_required", data: { qrReady: false, error: "Chưa có luồng tạo QR Zalo thật." } }
    });

    return ok({ session: { status: "login_required", data: { qrReady: false, error: "Chưa có luồng tạo QR Zalo thật." } } });
  });

  // POST /accounts/:kind/:id/session/telegram/start
  app.post("/accounts/:kind/:id/session/telegram/start", async (request) => {
    const { kind, id } = request.params as { kind: string; id: string };
    const body = request.body as AnyBody;
    
    const credentials = {
      apiId: Number(body.apiId),
      apiHash: String(body.apiHash),
      phoneNumber: String(body.phoneNumber)
    };

    if (kind === "source") {
      await prisma.sourceAccount.update({
        where: { id },
        data: { credentials }
      });
    } else {
      await prisma.targetAccount.update({
        where: { id },
        data: { credentials }
      });
    }

    await prisma.platformSession.upsert({
      where: { platform_accountKind_accountId: { platform: "telegram", accountKind: kind, accountId: id } },
      create: { platform: "telegram", accountKind: kind, accountId: id, status: "code_sent", data: { phoneNumber: String(body.phoneNumber) } },
      update: { status: "code_sent", data: { phoneNumber: String(body.phoneNumber) } }
    });
    return ok({ login: { status: "code_sent", phoneNumber: String(body.phoneNumber) } });
  });

  // POST /accounts/:kind/:id/session/telegram/code
  app.post("/accounts/:kind/:id/session/telegram/code", async (request) => {
    const { kind, id } = request.params as { kind: string; id: string };
    
    await prisma.platformSession.update({
      where: { platform_accountKind_accountId: { platform: "telegram", accountKind: kind, accountId: id } },
      data: { status: "login_ok", data: { status: "completed" } }
    });
    if (kind === "source") {
      await prisma.sourceAccount.update({ where: { id }, data: { health: "healthy", isActive: true } });
    } else {
      await prisma.targetAccount.update({ where: { id }, data: { health: "healthy", isActive: true } });
    }
    return ok({ login: { status: "completed" } });
  });

  // POST /accounts/:kind/:id/session/telegram/password
  app.post("/accounts/:kind/:id/session/telegram/password", async (request) => {
    const { kind, id } = request.params as { kind: string; id: string };
    await prisma.platformSession.update({
      where: { platform_accountKind_accountId: { platform: "telegram", accountKind: kind, accountId: id } },
      data: { status: "login_ok", data: { status: "completed" } }
    });
    if (kind === "source") {
      await prisma.sourceAccount.update({ where: { id }, data: { health: "healthy", isActive: true } });
    } else {
      await prisma.targetAccount.update({ where: { id }, data: { health: "healthy", isActive: true } });
    }
    return ok({ login: { status: "completed" } });
  });
}

async function registerStaticWeb(app: FastifyInstance) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(__dirname, "../../..", config.WEB_ADMIN_DIST);
  if (!existsSync(root)) return;
  await app.register(fastifyStatic, { root, prefix: "/" });
  app.setNotFoundHandler((request, reply) => {
    if (!request.url.startsWith("/api")) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy endpoint."));
  });
}
