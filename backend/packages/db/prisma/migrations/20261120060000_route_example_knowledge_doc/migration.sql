-- AlterTable
ALTER TABLE "RouteExample" ADD COLUMN "knowledgeDocId" INTEGER;

-- CreateIndex
CREATE INDEX "RouteExample_orgId_knowledgeDocId_idx" ON "RouteExample"("orgId", "knowledgeDocId");
