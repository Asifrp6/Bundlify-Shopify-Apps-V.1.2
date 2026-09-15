ALTER TABLE "Bundle" ADD COLUMN "discountNodeId" TEXT;
CREATE UNIQUE INDEX "Bundle_discountNodeId_key" ON "Bundle"("discountNodeId");
