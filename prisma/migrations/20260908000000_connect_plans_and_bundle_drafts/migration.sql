ALTER TABLE "SubscriptionPlan" ADD COLUMN "sellingPlanGroupId" TEXT;
-- Existing records were only saved locally; they are not live selling plans.
UPDATE "SubscriptionPlan" SET "status" = 'DRAFT';
CREATE UNIQUE INDEX "SubscriptionPlan_sellingPlanGroupId_key" ON "SubscriptionPlan"("sellingPlanGroupId");
CREATE INDEX "SubscriptionPlan_shop_createdAt_idx" ON "SubscriptionPlan"("shop", "createdAt");

CREATE TABLE "Bundle" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "shop" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "discount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Bundle_shop_createdAt_idx" ON "Bundle"("shop", "createdAt");
CREATE TABLE "BundleProduct" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "bundleId" INTEGER NOT NULL,
  "productId" TEXT NOT NULL,
  "productTitle" TEXT NOT NULL,
  CONSTRAINT "BundleProduct_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BundleProduct_bundleId_productId_key" ON "BundleProduct"("bundleId", "productId");
