import { classifyError, realtimeBus } from "@zerun/shared";
import { platformHealthJobSchema, type PlatformHealthJob } from "../types.js";
import type { ProcessorContext } from "./context.js";
import { toAdapterAccount } from "./helpers.js";
import { sendAlert } from "../notify/alert.js";

/** Session hỏng → tự pause (dừng nhận job theo convention `health === "paused"`). */
const BROKEN = new Set(["failed", "checkpoint", "login_required", "error"]);

/** Map status thô → status lưu DB: hỏng thì "paused" để dừng nhận job. */
function persistedHealth(status: string): string {
  return BROKEN.has(status) ? "paused" : status;
}

export async function processPlatformHealth(rawJob: unknown, context: ProcessorContext) {
  const job = platformHealthJobSchema.parse(rawJob) satisfies PlatformHealthJob;

  if (job.accountKind === "source") {
    const account = await context.prisma.sourceAccount.findUniqueOrThrow({ where: { id: job.accountId } });
    const adapter = context.registry.listRealtimePlatforms().includes(account.platform as never)
      ? context.registry.getRealtime(account.platform as never)
      : context.registry.getSource(account.platform as never);
    const health = await adapter.testConnection(toAdapterAccount(account)).catch((error) => ({
      status: "failed" as const,
      message: classifyError(error).message
    }));
    const stored = persistedHealth(health.status);
    await context.prisma.sourceAccount.update({ where: { id: account.id }, data: { health: stored } });
    if (stored === "paused") {
      await sendAlert(context.prisma, {
        category: "session_health",
        platform: account.platform,
        account: account.name,
        detail: health.message ?? health.status
      }).catch(() => undefined);
    }
    await context.prisma.activityLog.create({
      data: {
        type: "platform:health",
        platform: account.platform,
        sourceId: account.id,
        message: `${account.name}: ${health.message ?? health.status}${stored === "paused" ? " (đã tạm dừng)" : ""}`
      }
    });
    realtimeBus.emitEvent({
      type: "platform:health",
      accountId: account.id,
      accountKind: "source",
      platform: account.platform as never,
      health: stored as never,
      createdAt: new Date().toISOString()
    });
    return;
  }

  const account = await context.prisma.targetAccount.findUniqueOrThrow({ where: { id: job.accountId } });
  const adapter = context.registry.getPublish(account.platform as never);
  const health = await adapter.testConnection(toAdapterAccount(account)).catch((error) => ({
    status: "failed" as const,
    message: classifyError(error).message
  }));
  const stored = persistedHealth(health.status);
  await context.prisma.targetAccount.update({ where: { id: account.id }, data: { health: stored } });
  if (stored === "paused") {
    await sendAlert(context.prisma, {
      category: "session_health",
      platform: account.platform,
      account: account.name,
      detail: health.message ?? health.status
    }).catch(() => undefined);
  }
  await context.prisma.activityLog.create({
    data: {
      type: "platform:health",
      platform: account.platform,
      targetId: account.id,
      message: `${account.name}: ${health.message ?? health.status}${stored === "paused" ? " (đã tạm dừng)" : ""}`
    }
  });
  realtimeBus.emitEvent({
    type: "platform:health",
    accountId: account.id,
    accountKind: "target",
    platform: account.platform as never,
    health: stored as never,
    createdAt: new Date().toISOString()
  });
}
