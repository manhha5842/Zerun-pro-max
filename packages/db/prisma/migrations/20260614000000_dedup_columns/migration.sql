-- AlterTable: thêm contentHash và duplicateOfId cho dedup chéo nguồn (M1·B4)
ALTER TABLE "Content" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "Content" ADD COLUMN "duplicateOfId" TEXT;

-- CreateIndex
CREATE INDEX "Content_contentHash_idx" ON "Content"("contentHash");
