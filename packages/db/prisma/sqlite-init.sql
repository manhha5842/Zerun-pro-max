-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "health" TEXT NOT NULL DEFAULT 'unknown',
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "config" JSONB NOT NULL DEFAULT '{}',
    "lastCrawledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TargetAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "health" TEXT NOT NULL DEFAULT 'unknown',
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "config" JSONB NOT NULL DEFAULT '{}',
    "linkedSourceAccountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlatformSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "accountKind" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "cookiePath" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RoutingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "useAI" BOOLEAN NOT NULL DEFAULT false,
    "requireReview" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoutingRule_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SourceAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoutingRule_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "TargetAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlatformChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountKind" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelType" TEXT NOT NULL DEFAULT 'group',
    "isSource" BOOLEAN NOT NULL DEFAULT false,
    "isTarget" BOOLEAN NOT NULL DEFAULT false,
    "filterMode" TEXT NOT NULL DEFAULT 'all',
    "acceptedCategories" JSONB NOT NULL DEFAULT '[]',
    "allowGeneralContent" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RepostFlow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "useAI" BOOLEAN NOT NULL DEFAULT true,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "requireReview" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RepostFlowSource" (
    "flowId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    PRIMARY KEY ("flowId", "channelId"),
    CONSTRAINT "RepostFlowSource_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "RepostFlow" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepostFlowSource_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PlatformChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepostFlowTarget" (
    "flowId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    PRIMARY KEY ("flowId", "channelId"),
    CONSTRAINT "RepostFlowTarget_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "RepostFlow" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepostFlowTarget_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PlatformChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceChannelId" TEXT,
    "externalId" TEXT,
    "sourceUrl" TEXT,
    "author" TEXT,
    "originalText" TEXT NOT NULL,
    "draftText" TEXT,
    "finalText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'discovered',
    "scheduledAt" DATETIME,
    "scheduledTargets" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "savedReason" TEXT,
    "savedSource" TEXT,
    "lastError" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" DATETIME,
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    "postedAt" DATETIME,
    "contentHash" TEXT,
    "duplicateOfId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Content_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SourceAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutoConversionRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "lastFetchedAt" DATETIME,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AutoConversionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutoConversionRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutoConversionRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutoConversionLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "convertedUrl" TEXT,
    "network" TEXT NOT NULL DEFAULT 'unknown',
    "action" TEXT NOT NULL DEFAULT 'kept',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutoConversionLink_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutoConversionRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AutoConversionMedia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "localPath" TEXT,
    "cloudinaryUrl" TEXT,
    "mimeType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutoConversionMedia_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutoConversionRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrawlJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CrawlResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "postedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'new',
    "contentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrawlResult_crawlJobId_fkey" FOREIGN KEY ("crawlJobId") REFERENCES "CrawlJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "mimeType" TEXT,
    "sourceUrl" TEXT,
    "localPath" TEXT,
    "cdnUrl" TEXT,
    "checksum" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaAsset_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "convertedUrl" TEXT,
    "network" TEXT NOT NULL DEFAULT 'unknown',
    "status" TEXT NOT NULL DEFAULT 'detected',
    "position" JSONB,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentLink_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PublishAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetChannelId" TEXT,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resultUrl" TEXT,
    "error" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublishAttempt_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PublishAttempt_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "TargetAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Schedule_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Schedule_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "TargetAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkerJobLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queueName" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "jobId" TEXT,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "error" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "platform" TEXT,
    "contentId" TEXT,
    "sourceId" TEXT,
    "targetId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AiConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FbCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "postsPerDay" INTEGER NOT NULL DEFAULT 5,
    "startDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FbPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT,
    "type" TEXT NOT NULL,
    "caption" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FbPost_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "FbCampaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FbPostMedia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "localPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FbPostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FbPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FbPostTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "targetAccountId" TEXT NOT NULL,
    "scheduleMode" TEXT NOT NULL DEFAULT 'fixed',
    "fixedTime" DATETIME,
    "windowStart" TEXT,
    "windowEnd" TEXT,
    "scheduledAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FbPostTarget_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FbPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FbPostTarget_targetAccountId_fkey" FOREIGN KEY ("targetAccountId") REFERENCES "TargetAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FbPostComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "delayMinutes" INTEGER NOT NULL DEFAULT 5,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FbPostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FbPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommentQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "commentText" TEXT NOT NULL,
    "commentMedia" JSONB NOT NULL DEFAULT '[]',
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resultUrl" TEXT,
    "error" TEXT,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommentQueue_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommentQueue_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "TargetAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FbExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "targetId" TEXT,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "screenshotPath" TEXT,
    "postUrl" TEXT,
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "FbExecution_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FbPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FbExecution_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "FbPostTarget" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_adminUserId_idx" ON "RefreshToken"("adminUserId");

-- CreateIndex
CREATE INDEX "SourceAccount_platform_idx" ON "SourceAccount"("platform");

-- CreateIndex
CREATE INDEX "SourceAccount_isActive_health_idx" ON "SourceAccount"("isActive", "health");

-- CreateIndex
CREATE INDEX "TargetAccount_platform_idx" ON "TargetAccount"("platform");

-- CreateIndex
CREATE INDEX "TargetAccount_isActive_health_idx" ON "TargetAccount"("isActive", "health");

-- CreateIndex
CREATE INDEX "PlatformSession_accountId_accountKind_idx" ON "PlatformSession"("accountId", "accountKind");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSession_platform_accountKind_accountId_key" ON "PlatformSession"("platform", "accountKind", "accountId");

-- CreateIndex
CREATE INDEX "RoutingRule_sourceId_idx" ON "RoutingRule"("sourceId");

-- CreateIndex
CREATE INDEX "RoutingRule_targetId_idx" ON "RoutingRule"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingRule_sourceId_targetId_key" ON "RoutingRule"("sourceId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Content_code_key" ON "Content"("code");

-- CreateIndex
CREATE INDEX "Content_status_idx" ON "Content"("status");

-- CreateIndex
CREATE INDEX "Content_platform_idx" ON "Content"("platform");

-- CreateIndex
CREATE INDEX "Content_createdAt_idx" ON "Content"("createdAt");

-- CreateIndex
CREATE INDEX "Content_deletedAt_idx" ON "Content"("deletedAt");

-- CreateIndex
CREATE INDEX "Content_contentHash_idx" ON "Content"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "Content_platform_sourceId_externalId_key" ON "Content"("platform", "sourceId", "externalId");

-- CreateIndex
CREATE INDEX "AutoConversionRule_enabled_idx" ON "AutoConversionRule"("enabled");

-- CreateIndex
CREATE INDEX "AutoConversionRule_sourcePlatform_idx" ON "AutoConversionRule"("sourcePlatform");

-- CreateIndex
CREATE INDEX "AutoConversionRule_sourceAccountId_idx" ON "AutoConversionRule"("sourceAccountId");

-- CreateIndex
CREATE INDEX "AutoConversionRun_status_createdAt_idx" ON "AutoConversionRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AutoConversionRun_sourcePlatform_idx" ON "AutoConversionRun"("sourcePlatform");

-- CreateIndex
CREATE INDEX "AutoConversionRun_contentId_idx" ON "AutoConversionRun"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoConversionRun_ruleId_sourceExternalId_key" ON "AutoConversionRun"("ruleId", "sourceExternalId");

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
CREATE INDEX "CrawlResult_crawlJobId_idx" ON "CrawlResult"("crawlJobId");

-- CreateIndex
CREATE INDEX "CrawlResult_status_idx" ON "CrawlResult"("status");

-- CreateIndex
CREATE INDEX "CrawlResult_createdAt_idx" ON "CrawlResult"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrawlResult_platform_sourceRef_externalId_key" ON "CrawlResult"("platform", "sourceRef", "externalId");

-- CreateIndex
CREATE INDEX "MediaAsset_contentId_idx" ON "MediaAsset"("contentId");

-- CreateIndex
CREATE INDEX "MediaAsset_checksum_idx" ON "MediaAsset"("checksum");

-- CreateIndex
CREATE INDEX "ContentLink_network_idx" ON "ContentLink"("network");

-- CreateIndex
CREATE INDEX "ContentLink_status_idx" ON "ContentLink"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ContentLink_contentId_originalUrl_key" ON "ContentLink"("contentId", "originalUrl");

-- CreateIndex
CREATE INDEX "PublishAttempt_contentId_idx" ON "PublishAttempt"("contentId");

-- CreateIndex
CREATE INDEX "PublishAttempt_targetId_idx" ON "PublishAttempt"("targetId");

-- CreateIndex
CREATE INDEX "PublishAttempt_targetChannelId_idx" ON "PublishAttempt"("targetChannelId");

-- CreateIndex
CREATE INDEX "PublishAttempt_status_idx" ON "PublishAttempt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PublishAttempt_contentId_targetId_attemptNo_key" ON "PublishAttempt"("contentId", "targetId", "attemptNo");

-- CreateIndex
CREATE INDEX "Schedule_scheduledAt_status_idx" ON "Schedule"("scheduledAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_contentId_targetId_scheduledAt_key" ON "Schedule"("contentId", "targetId", "scheduledAt");

-- CreateIndex
CREATE INDEX "WorkerJobLog_queueName_status_idx" ON "WorkerJobLog"("queueName", "status");

-- CreateIndex
CREATE INDEX "WorkerJobLog_jobId_idx" ON "WorkerJobLog"("jobId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_type_idx" ON "ActivityLog"("type");

-- CreateIndex
CREATE UNIQUE INDEX "AiConfig_provider_name_key" ON "AiConfig"("provider", "name");

-- CreateIndex
CREATE INDEX "FbCampaign_status_idx" ON "FbCampaign"("status");

-- CreateIndex
CREATE INDEX "FbPost_campaignId_idx" ON "FbPost"("campaignId");

-- CreateIndex
CREATE INDEX "FbPost_status_idx" ON "FbPost"("status");

-- CreateIndex
CREATE INDEX "FbPost_scheduledAt_idx" ON "FbPost"("scheduledAt");

-- CreateIndex
CREATE INDEX "FbPostMedia_postId_idx" ON "FbPostMedia"("postId");

-- CreateIndex
CREATE INDEX "FbPostTarget_postId_idx" ON "FbPostTarget"("postId");

-- CreateIndex
CREATE INDEX "FbPostTarget_targetAccountId_idx" ON "FbPostTarget"("targetAccountId");

-- CreateIndex
CREATE INDEX "FbPostTarget_scheduledAt_status_idx" ON "FbPostTarget"("scheduledAt", "status");

-- CreateIndex
CREATE INDEX "FbPostComment_postId_idx" ON "FbPostComment"("postId");

-- CreateIndex
CREATE INDEX "CommentQueue_status_scheduledAt_idx" ON "CommentQueue"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "CommentQueue_contentId_idx" ON "CommentQueue"("contentId");

-- CreateIndex
CREATE INDEX "CommentQueue_targetId_idx" ON "CommentQueue"("targetId");

-- CreateIndex
CREATE INDEX "FbExecution_postId_idx" ON "FbExecution"("postId");

-- CreateIndex
CREATE INDEX "FbExecution_targetId_idx" ON "FbExecution"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformChannel_accountKind_accountId_externalId_key" ON "PlatformChannel"("accountKind", "accountId", "externalId");

-- CreateIndex
CREATE INDEX "PlatformChannel_accountKind_accountId_idx" ON "PlatformChannel"("accountKind", "accountId");

-- CreateIndex
CREATE INDEX "PlatformChannel_isSource_isActive_idx" ON "PlatformChannel"("isSource", "isActive");

-- CreateIndex
CREATE INDEX "PlatformChannel_isTarget_isActive_idx" ON "PlatformChannel"("isTarget", "isActive");

-- CreateIndex
CREATE INDEX "RepostFlow_isActive_idx" ON "RepostFlow"("isActive");

-- CreateIndex
CREATE INDEX "RepostFlowSource_channelId_idx" ON "RepostFlowSource"("channelId");

-- CreateIndex
CREATE INDEX "RepostFlowTarget_channelId_idx" ON "RepostFlowTarget"("channelId");

-- CreateIndex
CREATE INDEX "TargetAccount_linkedSourceAccountId_idx" ON "TargetAccount"("linkedSourceAccountId");

-- CreateIndex
CREATE INDEX "Content_sourceChannelId_idx" ON "Content"("sourceChannelId");


