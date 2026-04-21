import { classifyError, realtimeBus } from "@zerun/shared";
import { platformHealthJobSchema, type PlatformHealthJob } from "../types.js";
import type { ProcessorContext } from "./context.js";
import { toAdapterAccount } from "./helpers.js";

export async function processPlatformHealth(rawJob: unknown, context: ProcessorContext) {
  const job = platformHealthJobSchema.parse(rawJob) satisfies PlatformHealthJob;

  if (job.accountKind === "source") {
    const account = await context.prisma.sourceAccount.findUniqueOrThrow({ where: { id: job.accountId } });
    const adapter = context.registry.getSource(account.platform as never);
    const health = await adapter.testConnection(toAdapterAccount(account)).catch((error) => ({
      status: "failed" as const,
      message: classifyError(error).message
    }));
    await context.prisma.sourceAccount.update({ where: { id: account.id }, data: { health: health.status } });
    await context.prisma.activityLog.create({
      data: {
        type: "platform:health",
        platform: account.platform,
        sourceId: account.id,
        message: `${account.name}: ${health.message ?? health.status}`
      }
    });
    realtimeBus.emitEvent({
      type: "platform:health",
      accountId: account.id,
      accountKind: "source",
      platform: account.platform as never,
      health: health.status,
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
  await context.prisma.targetAccount.update({ where: { id: account.id }, data: { health: health.status } });
  await context.prisma.activityLog.create({
    data: {
      type: "platform:health",
      platform: account.platform,
      targetId: account.id,
      message: `${account.name}: ${health.message ?? health.status}`
    }
  });
  realtimeBus.emitEvent({
    type: "platform:health",
    accountId: account.id,
    accountKind: "target",
    platform: account.platform as never,
    health: health.status,
    createdAt: new Date().toISOString()
  });
}
