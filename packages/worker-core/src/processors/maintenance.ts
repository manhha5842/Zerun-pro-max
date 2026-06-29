import { promises as fs, Stats } from "fs";
import path from "path";
import { z } from "zod";
import { logger } from "@zerun/shared";

export const maintenanceJobSchema = z.object({
  version: z.literal(1),
  kind: z.enum(["media", "orphan", "all"]).default("all"),
  retentionDays: z.number().int().positive().optional(),
  dryRun: z.boolean().default(false)
});

export type MaintenanceJob = z.infer<typeof maintenanceJobSchema>;

interface CleanupResult {
  kind: string;
  deletedCount: number;
  freedBytes: number;
  errors: string[];
}

const DEFAULT_RETENTION_DAYS = 30;

async function getFileStats(filePath: string): Promise<Stats | null> {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

async function deleteFile(filePath: string, dryRun: boolean): Promise<{ deleted: boolean; size: number; error?: string }> {
  const stats = await getFileStats(filePath);
  if (!stats) {
    return { deleted: false, size: 0, error: "File not found" };
  }

  if (dryRun) {
    logger.info(`[Maintenance DryRun] Would delete: ${filePath}`);
    return { deleted: false, size: stats.size };
  }

  try {
    await fs.unlink(filePath);
    return { deleted: true, size: stats.size };
  } catch (error) {
    return { deleted: false, size: 0, error: String(error) };
  }
}

async function scanDirectory(dirPath: string, extensions?: string[]): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await scanDirectory(fullPath, extensions);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        if (!extensions || extensions.some((ext) => entry.name.toLowerCase().endsWith(ext.toLowerCase()))) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    logger.warn(`[Maintenance] Cannot scan directory: ${dirPath}`, { error: String(error) });
  }

  return files;
}

async function cleanupMediaByRetention(
  prisma: any,
  mediaDir: string,
  retentionDays: number,
  dryRun: boolean
): Promise<CleanupResult> {
  const result: CleanupResult = { kind: "media_retention", deletedCount: 0, freedBytes: 0, errors: [] };
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const mediaExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".avi", ".webm", ".pdf"];
  const files = await scanDirectory(mediaDir, mediaExtensions);

  for (const filePath of files) {
    const stats = await getFileStats(filePath);
    if (!stats) continue;

    if (stats.mtime < cutoffDate) {
      const localPath = filePath.replace(/\\/g, "/");
      const mediaAsset = await prisma.mediaAsset.findFirst({
        where: { localPath }
      });

      if (!mediaAsset) {
        const deleted = await deleteFile(filePath, dryRun);
        if (deleted.deleted) {
          result.deletedCount++;
          result.freedBytes += deleted.size;
        } else if (deleted.error) {
          result.errors.push(`${path.basename(filePath)}: ${deleted.error}`);
        }
      }
    }
  }

  return result;
}

async function cleanupOrphanedMedia(
  prisma: any,
  mediaDir: string,
  dryRun: boolean
): Promise<CleanupResult> {
  const result: CleanupResult = { kind: "media_orphan", deletedCount: 0, freedBytes: 0, errors: [] };

  const mediaExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".avi", ".webm", ".pdf"];
  const files = await scanDirectory(mediaDir, mediaExtensions);

  const dbLocalPaths = await prisma.mediaAsset.findMany({
    where: { localPath: { not: null } },
    select: { localPath: true }
  });

  const validPaths = new Set(dbLocalPaths.map((r: { localPath: string }) => r.localPath?.replace(/\\/g, "/")));

  for (const filePath of files) {
    const localPath = filePath.replace(/\\/g, "/");
    if (!validPaths.has(localPath)) {
      const deleted = await deleteFile(filePath, dryRun);
      if (deleted.deleted) {
        result.deletedCount++;
        result.freedBytes += deleted.size;
      } else if (deleted.error) {
        result.errors.push(`${path.basename(filePath)}: ${deleted.error}`);
      }
    }
  }

  return result;
}

async function cleanupOldActivityLogs(prisma: any, retentionDays: number, dryRun: boolean): Promise<CleanupResult> {
  const result: CleanupResult = { kind: "activity_log", deletedCount: 0, freedBytes: 0, errors: [] };

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  if (dryRun) {
    const count = await prisma.activityLog.count({ where: { createdAt: { lt: cutoffDate } } });
    logger.info(`[Maintenance DryRun] Would delete ${count} old activity logs`);
    return result;
  }

  try {
    const deleted = await prisma.activityLog.deleteMany({
      where: { createdAt: { lt: cutoffDate } }
    });
    result.deletedCount = deleted.count;
  } catch (error) {
    result.errors.push(`ActivityLog cleanup failed: ${String(error)}`);
  }

  return result;
}

async function cleanupOldWorkerJobLogs(prisma: any, retentionDays: number, dryRun: boolean): Promise<CleanupResult> {
  const result: CleanupResult = { kind: "worker_job_log", deletedCount: 0, freedBytes: 0, errors: [] };

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  if (dryRun) {
    const count = await prisma.workerJobLog.count({ where: { createdAt: { lt: cutoffDate } } });
    logger.info(`[Maintenance DryRun] Would delete ${count} old worker job logs`);
    return result;
  }

  try {
    const deleted = await prisma.workerJobLog.deleteMany({
      where: { createdAt: { lt: cutoffDate } }
    });
    result.deletedCount = deleted.count;
  } catch (error) {
    result.errors.push(`WorkerJobLog cleanup failed: ${String(error)}`);
  }

  return result;
}

export async function processMaintenance(rawJob: unknown, context: any) {
  const job = maintenanceJobSchema.parse(rawJob) satisfies MaintenanceJob;
  const { kind, retentionDays = DEFAULT_RETENTION_DAYS, dryRun } = job;

  logger.info(`[Maintenance] Starting cleanup: kind=${kind}, retentionDays=${retentionDays}, dryRun=${dryRun}`);

  const mediaDir = process.env.MEDIA_STORAGE_DIR ?? process.env.MEDIA_UPLOAD_ROOT ?? "storage/media";
  const results: CleanupResult[] = [];

  if (kind === "media" || kind === "all") {
    const retentionResult = await cleanupMediaByRetention(context.prisma, mediaDir, retentionDays, dryRun);
    results.push(retentionResult);

    const orphanResult = await cleanupOrphanedMedia(context.prisma, mediaDir, dryRun);
    results.push(orphanResult);
  }

  if (kind === "orphan" || kind === "all") {
    const orphanResult = await cleanupOrphanedMedia(context.prisma, mediaDir, dryRun);
    results.push(orphanResult);
  }

  const logRetentionDays = retentionDays * 2;
  const activityResult = await cleanupOldActivityLogs(context.prisma, logRetentionDays, dryRun);
  results.push(activityResult);

  const workerLogResult = await cleanupOldWorkerJobLogs(context.prisma, logRetentionDays, dryRun);
  results.push(workerLogResult);

  const totalDeleted = results.reduce((sum, r) => sum + r.deletedCount, 0);
  const totalFreed = results.reduce((sum, r) => sum + r.freedBytes, 0);
  const allErrors = results.flatMap((r) => r.errors);

  await context.prisma.activityLog.create({
    data: {
      type: "maintenance",
      message: `Maintenance ${dryRun ? "(dry-run) " : ""}hoàn thành: xóa ${totalDeleted} items, giải phóng ${formatBytes(totalFreed)}${allErrors.length > 0 ? `, ${allErrors.length} lỗi` : ""}`
    }
  });

  logger.info(`[Maintenance] Completed: deleted=${totalDeleted}, freed=${formatBytes(totalFreed)}, errors=${allErrors.length}`);

  return {
    totalDeleted,
    freedBytes: totalFreed,
    results,
    errors: allErrors
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
