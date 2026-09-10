/*
  Warnings:

  - The primary key for the `SubscriptionPlan` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `discount` on the `SubscriptionPlan` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `id` on the `SubscriptionPlan` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_SubscriptionPlan" ("createdAt", "discount", "frequency", "id", "name", "productId", "shop", "status") SELECT "createdAt", "discount", "frequency", "id", "name", "productId", "shop", "status" FROM "SubscriptionPlan";
DROP TABLE "SubscriptionPlan";
ALTER TABLE "new_SubscriptionPlan" RENAME TO "SubscriptionPlan";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
