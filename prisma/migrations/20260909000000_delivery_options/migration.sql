CREATE TABLE "DeliveryOption" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "subscriptionPlanId" INTEGER NOT NULL,
  "frequency" TEXT NOT NULL,
  "interval" TEXT NOT NULL,
  "intervalCount" INTEGER NOT NULL,
  "discount" INTEGER NOT NULL,
  "sellingPlanId" TEXT,
  CONSTRAINT "DeliveryOption_subscriptionPlanId_fkey" FOREIGN KEY ("subscriptionPlanId") REFERENCES "SubscriptionPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DeliveryOption_sellingPlanId_key" ON "DeliveryOption"("sellingPlanId");
INSERT INTO "DeliveryOption" ("subscriptionPlanId", "frequency", "interval", "intervalCount", "discount")
SELECT "id", "frequency", CASE "frequency" WHEN 'Weekly' THEN 'WEEK' WHEN 'Yearly' THEN 'YEAR' ELSE 'MONTH' END, 1, "discount" FROM "SubscriptionPlan";
