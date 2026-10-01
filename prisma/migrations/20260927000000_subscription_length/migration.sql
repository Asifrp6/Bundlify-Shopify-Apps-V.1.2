-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN "lengthEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "lengthOptionsJson" TEXT NOT NULL DEFAULT '[]';
