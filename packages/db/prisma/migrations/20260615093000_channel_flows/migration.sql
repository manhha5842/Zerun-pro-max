ALTER TABLE "TargetAccount" ADD COLUMN "linkedSourceAccountId" TEXT;
ALTER TABLE "Content" ADD COLUMN "sourceChannelId" TEXT;
ALTER TABLE "PublishAttempt" ADD COLUMN "targetChannelId" TEXT;

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

CREATE TABLE "RepostFlowSource" (
    "flowId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    PRIMARY KEY ("flowId", "channelId"),
    CONSTRAINT "RepostFlowSource_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "RepostFlow" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepostFlowSource_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PlatformChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "RepostFlowTarget" (
    "flowId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    PRIMARY KEY ("flowId", "channelId"),
    CONSTRAINT "RepostFlowTarget_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "RepostFlow" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RepostFlowTarget_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PlatformChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PlatformChannel_accountKind_accountId_externalId_key" ON "PlatformChannel"("accountKind", "accountId", "externalId");
CREATE INDEX "PlatformChannel_accountKind_accountId_idx" ON "PlatformChannel"("accountKind", "accountId");
CREATE INDEX "PlatformChannel_isSource_isActive_idx" ON "PlatformChannel"("isSource", "isActive");
CREATE INDEX "PlatformChannel_isTarget_isActive_idx" ON "PlatformChannel"("isTarget", "isActive");
CREATE INDEX "RepostFlow_isActive_idx" ON "RepostFlow"("isActive");
CREATE INDEX "RepostFlowSource_channelId_idx" ON "RepostFlowSource"("channelId");
CREATE INDEX "RepostFlowTarget_channelId_idx" ON "RepostFlowTarget"("channelId");
CREATE INDEX "TargetAccount_linkedSourceAccountId_idx" ON "TargetAccount"("linkedSourceAccountId");
CREATE INDEX "Content_sourceChannelId_idx" ON "Content"("sourceChannelId");
CREATE INDEX "PublishAttempt_targetChannelId_idx" ON "PublishAttempt"("targetChannelId");
