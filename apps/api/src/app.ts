import path from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { compare, hash } from "bcryptjs";
import { detectLinks } from "@zerun/core";
import { prisma } from "@zerun/db";
import { buildPagination, fail, ok, realtimeBus, type Platform } from "@zerun/shared";
import { createWorkerCore, type WorkerCore } from "@zerun/worker-core";
import { config } from "./config.js";

type AnyBody = Record<string, any>;

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
  app.addHook("preHandler", app.authenticate);

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
  registerFacebookRoutes(app);
}

function registerContentRoutes(app: FastifyInstance) {
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
        include: { links: true, media: true, source: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      })
    ]);
    return ok({ contents }, buildPagination(page, limit, total));
  });

  app.get("/contents/:code", async (request, reply) => {
    const { code } = request.params as { code: string };
    const content = await prisma.content.findUnique({ where: { code }, include: { links: true, media: true, publishAttempts: true, source: true } });
    if (!content) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy nội dung."));
    return ok({ content });
  });

  app.get("/contents/:code/preview", async (request, reply) => {
    const { code } = request.params as { code: string };
    const content = await prisma.content.findUnique({ where: { code } });
    if (!content) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy nội dung."));
    return ok({ text: content.finalText ?? content.draftText ?? content.originalText });
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
    const targetIds = Array.isArray(body.targetIds) ? body.targetIds : content.scheduledTargets;
    if (!Array.isArray(targetIds) || targetIds.length === 0) return reply.code(400).send(fail("TARGET_REQUIRED", "Cần chọn ít nhất một target."));
    await Promise.all(targetIds.map((targetId) => app.workerCore.publishNow(content.id, String(targetId), "admin")));
    return ok({ queued: true });
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

function registerAccountRoutes(app: FastifyInstance) {
  app.get("/accounts", async () => {
    const [sources, targets] = await Promise.all([prisma.sourceAccount.findMany(), prisma.targetAccount.findMany()]);
    return ok({ accounts: [...sources.map((account) => ({ ...account, kind: "source" })), ...targets.map((account) => ({ ...account, kind: "target" }))] });
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

function registerFacebookRoutes(app: FastifyInstance) {
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

  app.delete("/facebook/posts/:id", async (request) => {
    const { id } = request.params as { id: string };
    await prisma.fbPost.delete({ where: { id } });
    return ok({ success: true });
  });

  // Batch import: create multiple posts at once for a campaign
  app.post("/facebook/campaigns/:id/import", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as AnyBody;
    const campaign = await prisma.fbCampaign.findUnique({ where: { id } });
    if (!campaign) return reply.code(404).send(fail("NOT_FOUND", "Không tìm thấy chiến dịch."));

    const items: AnyBody[] = Array.isArray(body.posts) ? body.posts : [];
    if (items.length === 0) return reply.code(400).send(fail("EMPTY_IMPORT", "Không có bài nào để import."));
    if (items.length > 100) return reply.code(400).send(fail("LIMIT_EXCEEDED", "Tối đa 100 bài mỗi lần import."));

    const created = await Promise.all(
      items.map((item: AnyBody, idx: number) => {
        const type = String(item.type ?? "feed");
        return prisma.fbPost.create({
          data: {
            campaignId: id,
            type,
            caption: item.caption ? String(item.caption) : undefined,
            media: { create: (Array.isArray(item.media) ? item.media : []).map((m: AnyBody, i: number) => ({ localPath: String(m.localPath), mimeType: String(m.mimeType ?? "image/jpeg"), sortOrder: i })) },
            targets: {
              create: (Array.isArray(item.targets) ? item.targets : []).map((t: AnyBody) => ({
                targetAccountId: String(t.targetAccountId),
                scheduleMode: String(t.scheduleMode ?? "fixed"),
                fixedTime: t.fixedTime ? new Date(String(t.fixedTime)) : undefined,
                windowStart: t.windowStart ? String(t.windowStart) : undefined,
                windowEnd: t.windowEnd ? String(t.windowEnd) : undefined
              }))
            },
            comments: {
              create: (Array.isArray(item.comments) ? item.comments : []).map((c: AnyBody, i: number) => ({
                text: String(c.text),
                delayMinutes: Number(c.delayMinutes ?? 5),
                sortOrder: i
              }))
            }
          }
        });
      })
    );
    return ok({ imported: created.length, postIds: created.map((p) => p.id) });
  });
}

// ── Schedule helpers ───────────────────────────────────────────────────────────

function resolveScheduledAt(date: Date, mode: string, fixedTime: Date | null, windowStart: string | null, windowEnd: string | null): Date {
  const result = new Date(date);

  if (mode === "random" && windowStart && windowEnd) {
    const [startH, startM] = windowStart.split(":").map(Number);
    const [endH, endM] = windowEnd.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const randomMinutes = startMinutes + Math.floor(Math.random() * (endMinutes - startMinutes));
    result.setHours(Math.floor(randomMinutes / 60), randomMinutes % 60, 0, 0);
    return result;
  }

  if (fixedTime) {
    result.setHours(fixedTime.getHours(), fixedTime.getMinutes(), 0, 0);
    return result;
  }

  // Default: 9:00 AM
  result.setHours(9, 0, 0, 0);
  return result;
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
