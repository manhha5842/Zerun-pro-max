import { scheduleReleaseJobSchema, type ScheduleReleaseJob } from "../types.js";
import type { ProcessorContext } from "./context.js";

export async function processScheduleRelease(rawJob: unknown, context: ProcessorContext) {
  const job = scheduleReleaseJobSchema.parse(rawJob) satisfies ScheduleReleaseJob;
  const schedule = await context.prisma.schedule.findUniqueOrThrow({
    where: { id: job.scheduleId },
    include: { content: true }
  });
  if (schedule.status !== "scheduled") return;

  await context.prisma.schedule.update({ where: { id: schedule.id }, data: { status: "released" } });
  await context.prisma.content.update({ where: { id: schedule.contentId }, data: { status: "ready_to_publish" } });
  await context.enqueuePublish({
    version: 1,
    contentId: schedule.contentId,
    targetId: schedule.targetId,
    requestedBy: "system"
  });
}
