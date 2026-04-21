-- CreateTable
CREATE TABLE "FbCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "postsPerDay" INTEGER NOT NULL DEFAULT 5,
    "startDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FbCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FbPost" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "type" TEXT NOT NULL,
    "caption" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FbPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FbPostMedia" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "localPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FbPostMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FbPostTarget" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "targetAccountId" TEXT NOT NULL,
    "scheduleMode" TEXT NOT NULL DEFAULT 'fixed',
    "fixedTime" TIMESTAMP(3),
    "windowStart" TEXT,
    "windowEnd" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FbPostTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FbPostComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "delayMinutes" INTEGER NOT NULL DEFAULT 5,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FbPostComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FbExecution" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "targetId" TEXT,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "screenshotPath" TEXT,
    "postUrl" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "FbExecution_pkey" PRIMARY KEY ("id")
);

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
CREATE INDEX "FbExecution_postId_idx" ON "FbExecution"("postId");

-- CreateIndex
CREATE INDEX "FbExecution_targetId_idx" ON "FbExecution"("targetId");

-- AddForeignKey
ALTER TABLE "FbPost" ADD CONSTRAINT "FbPost_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "FbCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FbPostMedia" ADD CONSTRAINT "FbPostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FbPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FbPostTarget" ADD CONSTRAINT "FbPostTarget_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FbPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FbPostTarget" ADD CONSTRAINT "FbPostTarget_targetAccountId_fkey" FOREIGN KEY ("targetAccountId") REFERENCES "TargetAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FbPostComment" ADD CONSTRAINT "FbPostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FbPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FbExecution" ADD CONSTRAINT "FbExecution_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FbPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FbExecution" ADD CONSTRAINT "FbExecution_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "FbPostTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
