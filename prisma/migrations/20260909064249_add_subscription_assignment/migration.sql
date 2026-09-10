/*
  Warnings:

  - You are about to drop the column `assignmentType` on the `SubscriptionPlan` table. All the data in the column will be lost.
  - You are about to drop the column `collectionId` on the `SubscriptionPlan` table. All the data in the column will be lost.
  - You are about to drop the column `productIds` on the `SubscriptionPlan` table. All the data in the column will be lost.
  - Made the column `productId` on table `SubscriptionPlan` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SubscriptionPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT,
    "productImage" TEXT,
    "frequency" TEXT NOT NULL,
    "discount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sellingPlanGroupId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_SubscriptionPlan" ("createdAt", "discount", "frequency", "id", "name", "productId", "productImage", "productTitle", "sellingPlanGroupId", "shop", "status") SELECT "createdAt", "discount", "frequency", "id", "name", "productId", "productImage", "productTitle", "sellingPlanGroupId", "shop", "status" FROM "SubscriptionPlan";
DROP TABLE "SubscriptionPlan";
ALTER TABLE "new_SubscriptionPlan" RENAME TO "SubscriptionPlan";
CREATE UNIQUE INDEX "SubscriptionPlan_sellingPlanGroupId_key" ON "SubscriptionPlan"("sellingPlanGroupId");
CREATE INDEX "SubscriptionPlan_shop_createdAt_idx" ON "SubscriptionPlan"("shop", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
