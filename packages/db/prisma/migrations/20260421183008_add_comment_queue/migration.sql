-- CreateTable
CREATE TABLE "CommentQueue" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "commentText" TEXT NOT NULL,
    "commentMedia" JSONB NOT NULL DEFAULT '[]',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resultUrl" TEXT,
    "error" TEXT,
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommentQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommentQueue_status_scheduledAt_idx" ON "CommentQueue"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "CommentQueue_contentId_idx" ON "CommentQueue"("contentId");

-- CreateIndex
CREATE INDEX "CommentQueue_targetId_idx" ON "CommentQueue"("targetId");

-- AddForeignKey
ALTER TABLE "CommentQueue" ADD CONSTRAINT "CommentQueue_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentQueue" ADD CONSTRAINT "CommentQueue_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "TargetAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
