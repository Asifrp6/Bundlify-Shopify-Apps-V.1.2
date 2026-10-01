-- CreateTable
CREATE TABLE "GiftOption" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "syncError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "GiftOption_shop_kind_idx" ON "GiftOption"("shop", "kind");
