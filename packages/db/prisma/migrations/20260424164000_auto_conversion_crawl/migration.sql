-- AlterTable
ALTER TABLE "Content" ADD COLUMN "savedReason" TEXT;
ALTER TABLE "Content" ADD COLUMN "savedSource" TEXT;
ALTER TABLE "Content" ADD COLUMN "lastError" TEXT;
ALTER TABLE "Content" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Content" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Content" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Content" ADD COLUMN "cancelReason" TEXT;

-- CreateTable
CREATE TABLE "AutoConversionRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sourcePlatform" TEXT NOT NULL,
    "sourceAccountId" TEXT,
    "sourceRef" TEXT NOT NULL,
    "triggerMode" TEXT NOT NULL DEFAULT 'polling',
    "pollingIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "lastCursor" TEXT,
    "lastExternalId" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "targetAccountIds" JSONB NOT NULL DEFAULT '[]',
    "postType" TEXT NOT NULL DEFAULT 'feed',
    "includeFirstComment" BOOLEAN NOT NULL DEFAULT false,
    "commentMode" TEXT NOT NULL DEFAULT 'none',
    "customComment" TEXT,
    "linkRules" JSONB NOT NULL DEFAULT '{}',
    "contentRules" JSONB NOT NULL DEFAULT '{}',
    "mediaRules" JSONB NOT NULL DEFAULT '{}',
    "scheduleRules" JSONB NOT NULL DEFAULT '{}',
    "aiConfigId" TEXT,
    "cloudinaryKeyIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoConversionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoConversionRun" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "sourceExternalId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "originalText" TEXT NOT NULL,
    "processedText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new_detected',
    "contentId" TEXT,
    "targetAccountIds" JSONB NOT NULL DEFAULT '[]',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoConversionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoConversionLink" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "convertedUrl" TEXT,
    "network" TEXT NOT NULL DEFAULT 'unknown',
    "action" TEXT NOT NULL DEFAULT 'kept',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoConversionLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoConversionMedia" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "localPath" TEXT,
    "cloudinaryUrl" TEXT,
    "mimeType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoConversionMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlJob" (
    "id" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "accountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "options" JSONB NOT NULL DEFAULT '{}',
    "storageConfig" JSONB NOT NULL DEFAULT '{}',
    "commentOptions" JSONB NOT NULL DEFAULT '{}',
    "totalFound" INTEGER NOT NULL DEFAULT 0,
    "totalSaved" INTEGER NOT NULL DEFAULT 0,
    "totalDuplicate" INTEGER NOT NULL DEFAULT 0,
    "totalFailed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrawlJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlResult" (
    "id" TEXT NOT NULL,
    "crawlJobId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "author" TEXT,
    "sourceUrl" TEXT,
    "originalText" TEXT NOT NULL,
    "media" JSONB NOT NULL DEFAULT '[]',
    "comments" JSONB NOT NULL DEFAULT '[]',
    "links" JSONB NOT NULL DEFAULT '[]',
    "postedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'new',
    "contentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrawlResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Content_deletedAt_idx" ON "Content"("deletedAt");

-- CreateIndex
CREATE INDEX "AutoConversionRule_enabled_idx" ON "AutoConversionRule"("enabled");

-- CreateIndex
CREATE INDEX "AutoConversionRule_sourcePlatform_idx" ON "AutoConversionRule"("sourcePlatform");

-- CreateIndex
CREATE INDEX "AutoConversionRule_sourceAccountId_idx" ON "AutoConversionRule"("sourceAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoConversionRun_ruleId_sourceExternalId_key" ON "AutoConversionRun"("ruleId", "sourceExternalId");

-- CreateIndex
CREATE INDEX "AutoConversionRun_status_createdAt_idx" ON "AutoConversionRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AutoConversionRun_sourcePlatform_idx" ON "AutoConversionRun"("sourcePlatform");

-- CreateIndex
CREATE INDEX "AutoConversionRun_contentId_idx" ON "AutoConversionRun"("contentId");

-- CreateIndex
CREATE INDEX "AutoConversionLink_runId_idx" ON "AutoConversionLink"("runId");

-- CreateIndex
CREATE INDEX "AutoConversionLink_network_idx" ON "AutoConversionLink"("network");

-- CreateIndex
CREATE INDEX "AutoConversionLink_action_idx" ON "AutoConversionLink"("action");

-- CreateIndex
CREATE INDEX "AutoConversionMedia_runId_idx" ON "AutoConversionMedia"("runId");

-- CreateIndex
CREATE INDEX "AutoConversionMedia_status_idx" ON "AutoConversionMedia"("status");

-- CreateIndex
CREATE INDEX "CrawlJob_sourcePlatform_idx" ON "CrawlJob"("sourcePlatform");

-- CreateIndex
CREATE INDEX "CrawlJob_status_createdAt_idx" ON "CrawlJob"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrawlResult_platform_sourceRef_externalId_key" ON "CrawlResult"("platform", "sourceRef", "externalId");

-- CreateIndex
CREATE INDEX "CrawlResult_crawlJobId_idx" ON "CrawlResult"("crawlJobId");

-- CreateIndex
CREATE INDEX "CrawlResult_status_idx" ON "CrawlResult"("status");

-- CreateIndex
CREATE INDEX "CrawlResult_createdAt_idx" ON "CrawlResult"("createdAt");

-- AddForeignKey
ALTER TABLE "AutoConversionRun" ADD CONSTRAINT "AutoConversionRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutoConversionRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoConversionLink" ADD CONSTRAINT "AutoConversionLink_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutoConversionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoConversionMedia" ADD CONSTRAINT "AutoConversionMedia_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutoConversionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlResult" ADD CONSTRAINT "CrawlResult_crawlJobId_fkey" FOREIGN KEY ("crawlJobId") REFERENCES "CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
