-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SubscriptionPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productIdsJson" TEXT NOT NULL DEFAULT '[]',
    "productTitle" TEXT,
    "productImage" TEXT,
    "frequency" TEXT NOT NULL,
    "discount" REAL NOT NULL,
    "discountType" TEXT NOT NULL DEFAULT 'percentage',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sellingPlanGroupId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_SubscriptionPlan" ("createdAt", "discount", "frequency", "id", "name", "productId", "productImage", "productTitle", "sellingPlanGroupId", "shop", "status") SELECT "createdAt", "discount", "frequency", "id", "name", "productId", "productImage", "productTitle", "sellingPlanGroupId", "shop", "status" FROM "SubscriptionPlan";
DROP TABLE "SubscriptionPlan";
ALTER TABLE "new_SubscriptionPlan" RENAME TO "SubscriptionPlan";
CREATE UNIQUE INDEX "SubscriptionPlan_sellingPlanGroupId_key" ON "SubscriptionPlan"("sellingPlanGroupId");
CREATE INDEX "SubscriptionPlan_shop_createdAt_idx" ON "SubscriptionPlan"("shop", "createdAt");
CREATE TABLE "new_DeliveryOption" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "subscriptionPlanId" INTEGER NOT NULL,
    "frequency" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "intervalCount" INTEGER NOT NULL,
    "discount" REAL NOT NULL,
    "discountType" TEXT NOT NULL DEFAULT 'percentage',
    "sellingPlanId" TEXT,
    CONSTRAINT "DeliveryOption_subscriptionPlanId_fkey" FOREIGN KEY ("subscriptionPlanId") REFERENCES "SubscriptionPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DeliveryOption" ("discount", "frequency", "id", "interval", "intervalCount", "sellingPlanId", "subscriptionPlanId") SELECT "discount", "frequency", "id", "interval", "intervalCount", "sellingPlanId", "subscriptionPlanId" FROM "DeliveryOption";
DROP TABLE "DeliveryOption";
ALTER TABLE "new_DeliveryOption" RENAME TO "DeliveryOption";
CREATE UNIQUE INDEX "DeliveryOption_sellingPlanId_key" ON "DeliveryOption"("sellingPlanId");
CREATE TABLE "new_Bundle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "discountNodeId" TEXT,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discount" REAL NOT NULL,
    "discountType" TEXT NOT NULL DEFAULT 'percentage',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Bundle" ("createdAt", "discount", "discountNodeId", "id", "name", "shop", "status") SELECT "createdAt", "discount", "discountNodeId", "id", "name", "shop", "status" FROM "Bundle";
DROP TABLE "Bundle";
ALTER TABLE "new_Bundle" RENAME TO "Bundle";
CREATE UNIQUE INDEX "Bundle_discountNodeId_key" ON "Bundle"("discountNodeId");
CREATE INDEX "Bundle_shop_createdAt_idx" ON "Bundle"("shop", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
