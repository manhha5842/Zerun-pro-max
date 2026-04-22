import path from "node:path";
import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { detectLinks } from "@zerun/core";
import type { BrowserContext } from "playwright";
import { prisma } from "@zerun/db";
import { buildPagination, fail, ok, realtimeBus, type Platform } from "@zerun/shared";
import { createWorkerCore, type WorkerCore } from "@zerun/worker-core";
import { config } from "./config.js";

type AnyBody = Record<string, any>;

type BrowserLoginPlatform = "facebook" | "instagram" | "threads";

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
  const app = Fastify({ logger: false });
  const workerCore = await createWorkerCore({ redisUrl: config.REDIS_URL });

  app.decorate("workerCore", workerCore);
  app.addHook("onClose", async () => {
    await workerCore.stop();
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
    const [totalContents, pendingJobs, publishedToday, failedJobs, sources, targets] = await Promise.all([
      prisma.content.count(),
      prisma.content.count({ where: { status: { in: ["waiting_link_convert", "waiting_manual_convert", "ready_to_publish", "scheduled", "publishing"] } } }),
      prisma.content.count({ where: { status: "published", updatedAt: { gte: today } } }),
      prisma.content.count({ where: { status: "failed" } }),
      prisma.sourceAccount.findMany({ select: { id: true, name: true, platform: true, health: true, isActive: true } }),
      prisma.targetAccount.findMany({ select: { id: true, name: true, platform: true, health: true, isActive: true } })
    ]);
    return ok({
      totalContents,
      pendingJobs,
      publishedToday,
      failedJobs,
      platformHealth: [...sources, ...targets]
    });
  });

  app.get("/dashboard/activity", async (request) => {
    const query = request.query as AnyBody;
    const limit = Math.min(Number(query.limit ?? 50), 100);
    const activities = await prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
    return ok({ activities });
  });

  registerContentRoutes(app);
  registerSourceRoutes(app);
  registerTargetRoutes(app);
  registerRoutingRoutes(app);
  registerLinkRoutes(app);
  registerScheduleRoutes(app);
  registerAccountRoutes(app);
  registerAiRoutes(app);
  registerImportRoutes(app);
  registerFacebookBrowserLoginRoutes(app);
  registerFacebookRoutes(app);
  registerHistoryRoutes(app);
  registerFailedRoutes(app);
  registerCommentQueueRoutes(app);
  registerTelegramSettingsRoutes(app);
}

function registerHistoryRoutes(app: FastifyInstance) {
  app.get("/history", async (request) => {
    const query = request.query as AnyBody;
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const where: Prisma.PublishAttemptWhereInput = {};

    if (query.status && String(query.status) !== "all") {
      where.status = String(query.status);
    }
    if (query.platform && String(query.platform) !== "all") {
      where.target = { is: { platform: String(query.platform) as Platform } };
    }

    const [total, attempts] = await Promise.all([
      prisma.publishAttempt.count({ where }),
      prisma.publishAttempt.findMany({
        where,
        include: {
          content: { select: { id: true, code: true, originalText: true, draftText: true, finalText: true, metadata: true } },
          target: { select: { id: true, name: true, platform: true } }
        },
        orderBy: { createdAt: "desc" },
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
    const content = await prisma.content.findUnique({ where: { code } });
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

    if (targetIds.length === 0) return reply.code(400).send(fail("NO_TARGETS", "Cần chỉ định tài khoản đăng."));

    await prisma.content.update({ where: { code }, data: { status: "ready_to_publish" } });
    await Promise.all(targetIds.map((targetId) => app.workerCore.publishNow(content.id, targetId, "admin")));
    return ok({ queued: true, targetCount: targetIds.length });
  });

  app.post("/failed/:code/reschedule", async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = request.body as AnyBody;
    const content = await prisma.content.findUnique({ where: { code } });
    if (!content) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy nội dung."));

    const scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      return reply.code(400).send(fail("BAD_REQUEST", "Cần cung cấp scheduledAt hợp lệ."));
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
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return reply.code(400).send(fail("BAD_REQUEST", "Cần cung cấp scheduledAt."));
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

function registerTelegramSettingsRoutes(app: FastifyInstance) {
  app.get("/settings/telegram", async () => {
    const setting = await prisma.systemSetting.findUnique({ where: { key: "telegram_notify" } });
    const data = (setting?.value ?? {}) as Record<string, unknown>;
    return ok({ botToken: data.botToken ?? "", chatId: data.chatId ?? "", enabled: data.enabled ?? false });
  });

  app.put("/settings/telegram", async (request) => {
    const body = request.body as AnyBody;
    await prisma.systemSetting.upsert({
      where: { key: "telegram_notify" },
      create: { key: "telegram_notify", value: { botToken: String(body.botToken ?? ""), chatId: String(body.chatId ?? ""), enabled: Boolean(body.enabled) } },
      update: { value: { botToken: String(body.botToken ?? ""), chatId: String(body.chatId ?? ""), enabled: Boolean(body.enabled) } }
    });
    return ok({ saved: true });
  });
}

function registerContentRoutes(app: FastifyInstance) {
  app.post("/contents/manual", async (request) => {
    const body = request.body as AnyBody;
    const originalText = String(body.originalText ?? body.text ?? "").trim();
    if (!originalText) {
      return { statusCode: 400, ...fail("CONTENT_REQUIRED", "Cần nhập nội dung bài viết.") };
    }

    const targetIds = Array.isArray(body.targetIds) ? body.targetIds.map(String) : [];
    const manualStatus = body.status ? String(body.status) : (targetIds.length > 0 ? "scheduled" : "ready_to_publish");
    const scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)) : undefined;

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
          type: body.type ? String(body.type) : "feed",
          comment: body.comment ? String(body.comment) : undefined,
          commentMedia: Array.isArray(body.commentMedia) ? body.commentMedia : [],
          mediaPaths: Array.isArray(body.mediaPaths) ? body.mediaPaths : [],
          fbPostId: body.fbPostId ? String(body.fbPostId) : undefined,
          manualMode: body.mode ? String(body.mode) : undefined
        }
      }
    });

    return ok({ content });
  });

  app.get("/contents", async (request) => {
    const query = request.query as AnyBody;
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const where: AnyBody = {};
    if (query.status) where.status = String(query.status);
    if (query.platform) where.platform = String(query.platform);
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
            select: { targetId: true }
          }
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      })
    ]);
    return ok({ contents }, buildPagination(page, limit, total));
  });

  app.get("/contents/:code", async (request, reply) => {
    const { code } = request.params as { code: string };
    const content = await prisma.content.findUnique({
      where: { code },
      include: {
        links: true,
        media: true,
        publishAttempts: { include: { target: { select: { id: true, name: true, platform: true } } } },
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
    if (!current) return reply.code(404).send(fail("NOT_FOUND", "Khong tim thay noi dung."));

    const baseMetadata = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
      ? (current.metadata as Record<string, unknown>)
      : {};
    const nextMetadata = {
      ...baseMetadata,
      ...(body.type !== undefined ? { type: String(body.type) } : {}),
      ...(body.comment !== undefined ? { comment: String(body.comment) } : {}),
      ...(Array.isArray(body.mediaPaths) ? { mediaPaths: body.mediaPaths.map(String) } : {})
    };
    const nextTargetIds = Array.isArray(body.targetIds) ? body.targetIds.map(String) : current.scheduledTargets;

    const content = await prisma.content.update({
      where: { code },
      data: {
        ...(body.draftText !== undefined ? { draftText: String(body.draftText) } : {}),
        scheduledTargets: (nextTargetIds ?? undefined) as Prisma.InputJsonValue | undefined,
        metadata: nextMetadata as Prisma.InputJsonValue
      }
    });
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
    await app.workerCore.processContent(content.id);
    return ok({ queued: true });
  });
  app.post("/contents/:code/publish", async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = request.body as AnyBody;
    const content = await prisma.content.findUnique({ where: { code } });
    if (!content) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy nội dung."));

    // Resolve target IDs: body.targetIds > content.scheduledTargets > active targets matching content.platform
    // Routing by platform:
    //   facebook  → publishNow (routes to facebook adapter via publish queue)
    //   instagram → publishNow (routes to instagram adapter via publish queue)
    //   threads   → publishNow (routes to threads adapter via publish queue)
    //   default   → publishNow (routes to whichever adapter matches the target)
    // Note: fb-post queue is only for the FbCampaign/FbPostTarget system and requires a different data model.
    let targetIds: string[] = [];
    if (Array.isArray(body.targetIds) && body.targetIds.length > 0) {
      targetIds = body.targetIds.map(String);
    } else if (Array.isArray(content.scheduledTargets) && (content.scheduledTargets as unknown[]).length > 0) {
      targetIds = (content.scheduledTargets as unknown[]).map(String);
    } else {
      // Fallback: find active targets matching content.platform
      const contentPlatform = content.platform && content.platform !== "manual" ? content.platform : "facebook";
      const platformTargets = await prisma.targetAccount.findMany({
        where: { platform: contentPlatform, isActive: true, health: { not: "paused" } },
        select: { id: true }
      });
      targetIds = platformTargets.map((target) => target.id);
    }

    if (targetIds.length === 0) {
      return reply.code(400).send(fail("TARGET_REQUIRED", `Không tìm được tài khoản đích để đăng (platform: ${content.platform}). Hãy chọn target hoặc tạo tài khoản phù hợp.`));
    }

    await Promise.all(targetIds.map((targetId) => app.workerCore.publishNow(content.id, targetId, "admin")));
    return ok({ queued: true, targetCount: targetIds.length, platform: content.platform });
  });
  app.post("/contents/:code/schedule", async (request, reply) => {
    const { code } = request.params as { code: string };
    const body = request.body as AnyBody;
    const content = await prisma.content.findUnique({ where: { code } });
    if (!content) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy nội dung."));
    const scheduledAt = new Date(String(body.scheduledAt));
    const targetIds = Array.isArray(body.targetIds) ? body.targetIds.map(String) : [];
    const schedules = await Promise.all(
      targetIds.map((targetId) =>
        prisma.schedule.create({
          data: { contentId: content.id, targetId, scheduledAt }
        })
      )
    );
    await prisma.content.update({ where: { id: content.id }, data: { status: "scheduled", scheduledAt, scheduledTargets: targetIds } });
    await Promise.all(schedules.map((schedule) => app.workerCore.scheduleRelease(schedule.id, scheduledAt)));
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

function registerTargetRoutes(app: FastifyInstance) {
  app.get("/targets", async () => ok({ targets: await prisma.targetAccount.findMany({ orderBy: { createdAt: "desc" } }) }));
  app.post("/targets", async (request) => ok({ target: await prisma.targetAccount.create({ data: request.body as any }) }));
  app.put("/targets/:id", async (request) => ok({ target: await prisma.targetAccount.update({ where: request.params as { id: string }, data: request.body as any }) }));
  app.delete("/targets/:id", async (request) => {
    await prisma.targetAccount.delete({ where: request.params as { id: string } });
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
        const detected = detectLinks(url)[0] ?? { url, network: "unknown" as const };
        return app.workerCore.registry.affiliateAdapter.convert({
          url,
          network: detected.network,
          campaignId: body.campaignId,
          subId: body.subId
        });
      })
    );
    return ok({ results });
  });
}

function registerScheduleRoutes(app: FastifyInstance) {
  app.get("/schedules", async () => ok({ schedules: await prisma.schedule.findMany({ include: { content: true, target: true }, orderBy: { scheduledAt: "asc" } }) }));
  app.post("/schedules", async (request) => createSchedule(request, app));
  app.put("/schedules/:id", async (request) => ok({ schedule: await prisma.schedule.update({ where: request.params as { id: string }, data: request.body as AnyBody }) }));
  app.delete("/schedules/:id", async (request) => {
    await prisma.schedule.delete({ where: request.params as { id: string } });
    return ok({ success: true });
  });
}

async function createSchedule(request: FastifyRequest, app: FastifyInstance) {
  const body = request.body as AnyBody;
  const contentId = String(body.contentId);
  const scheduledAt = new Date(String(body.scheduledAt));
  const targetIds = Array.isArray(body.targetIds) ? body.targetIds.map(String) : [];
  const schedules = await Promise.all(targetIds.map((targetId) => prisma.schedule.create({ data: { contentId, targetId, scheduledAt } })));
  await Promise.all(schedules.map((schedule) => app.workerCore.scheduleRelease(schedule.id, scheduledAt)));
  return ok({ schedules });
}

type BrowserPlatform = "facebook" | "instagram" | "threads";

const PLATFORM_SESSION_ROOTS: Record<BrowserPlatform, string> = {
  facebook: config.FACEBOOK_SESSION_ROOT,
  instagram: config.INSTAGRAM_SESSION_ROOT,
  threads: config.THREADS_SESSION_ROOT
};

async function inspectPersistedBrowserAccountHealth(app: FastifyInstance, account: AnyBody, platform: BrowserPlatform) {
  const credentials = (account.credentials ?? {}) as Record<string, unknown>;
  const sessionRoot = PLATFORM_SESSION_ROOTS[platform];
  const authPath = typeof credentials.authPath === "string" ? credentials.authPath : path.resolve(sessionRoot, `${account.id}`, "auth.json");
  const sessionDir = typeof credentials.sessionDir === "string" ? credentials.sessionDir : undefined;
  const hasSessionFile = existsSync(authPath);

  const platformLabel = platform === "facebook" ? "Facebook" : platform === "instagram" ? "Instagram" : "Threads";

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
      prisma.platformSession.findMany({ where: { platform: { in: ["facebook", "instagram", "threads"] }, accountKind: "target" } })
    ]);
    const persistedByAccountId = new Map(persistedSessions.map((session) => [session.accountId, session]));
    return ok({
      accounts: [
        ...sources.map((account) => ({ ...account, kind: "source" })),
        ...targets.map((account) => ({
          ...account,
          kind: "target",
          sessionState: ["facebook", "instagram", "threads"].includes(account.platform) ? persistedByAccountId.get(account.id)?.data ?? null : null
        }))
      ]
    });
  });
  app.put("/accounts/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    const updated =
      body.kind === "source"
        ? await prisma.sourceAccount.update({ where: { id }, data: body })
        : await prisma.targetAccount.update({ where: { id }, data: body });
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
  app.get("/health/platforms", async () => {
    const [sources, targets] = await Promise.all([prisma.sourceAccount.findMany(), prisma.targetAccount.findMany()]);
    return ok({ platformHealth: [...sources, ...targets] });
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
