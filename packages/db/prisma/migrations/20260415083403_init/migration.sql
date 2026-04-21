-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceAccount" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "health" TEXT NOT NULL DEFAULT 'unknown',
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "config" JSONB NOT NULL DEFAULT '{}',
    "lastCrawledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetAccount" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "health" TEXT NOT NULL DEFAULT 'unknown',
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TargetAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSession" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountKind" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "cookiePath" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingRule" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "useAI" BOOLEAN NOT NULL DEFAULT false,
    "requireReview" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sourceId" TEXT,
    "externalId" TEXT,
    "sourceUrl" TEXT,
    "author" TEXT,
    "originalText" TEXT NOT NULL,
    "draftText" TEXT,
    "finalText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'discovered',
    "scheduledAt" TIMESTAMP(3),
    "scheduledTargets" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "mimeType" TEXT,
    "sourceUrl" TEXT,
    "localPath" TEXT,
    "cdnUrl" TEXT,
    "checksum" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentLink" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "convertedUrl" TEXT,
    "network" TEXT NOT NULL DEFAULT 'unknown',
    "status" TEXT NOT NULL DEFAULT 'detected',
    "position" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishAttempt" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resultUrl" TEXT,
    "error" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerJobLog" (
    "id" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "jobId" TEXT,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerJobLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "platform" TEXT,
    "contentId" TEXT,
    "sourceId" TEXT,
    "targetId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConfig" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
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
CREATE UNIQUE INDEX "Content_platform_sourceId_externalId_key" ON "Content"("platform", "sourceId", "externalId");

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

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingRule" ADD CONSTRAINT "RoutingRule_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SourceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingRule" ADD CONSTRAINT "RoutingRule_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "TargetAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SourceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentLink" ADD CONSTRAINT "ContentLink_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishAttempt" ADD CONSTRAINT "PublishAttempt_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishAttempt" ADD CONSTRAINT "PublishAttempt_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "TargetAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "TargetAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
