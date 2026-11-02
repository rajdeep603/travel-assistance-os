-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'CLOSED', 'MOVED', 'UNREACHABLE');

-- CreateEnum
CREATE TYPE "PriceListStatus" AS ENUM ('NONE', 'LINK_SENT', 'RECEIVED');

-- CreateEnum
CREATE TYPE "PriceItem" AS ENUM ('CONSULTATION', 'SPECIALIST_VISIT', 'URGENT_CARE_VISIT', 'ER_VISIT', 'XRAY', 'CT_SCAN', 'MRI', 'BLOOD_PANEL', 'DENTAL_EXAM', 'OVERNIGHT_STAY');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('CALL', 'FORM', 'UPLOAD', 'TEAM');

-- CreateEnum
CREATE TYPE "ProviderChangeSource" AS ENUM ('CALL', 'FORM', 'TEAM', 'MERGE', 'IMPORT');

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "acceptsDirectBilling" BOOLEAN,
ADD COLUMN     "hours" TEXT,
ADD COLUMN     "internalRating" DOUBLE PRECISION,
ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "priceListStatus" "PriceListStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "status" "ProviderStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "verificationNote" TEXT;

-- CreateTable
CREATE TABLE "ProviderPrice" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "item" "PriceItem" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "source" "PriceSource" NOT NULL,
    "note" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderPriceLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "sentVia" TEXT,
    "sentTo" TEXT,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submission" JSONB,
    "uploadName" TEXT,
    "extracted" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderPriceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderChange" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "source" "ProviderChangeSource" NOT NULL,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderFeedback" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "by" TEXT,
    "caseRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Provider_status_idx" ON "Provider"("status");

-- CreateIndex
CREATE INDEX "ProviderPrice_providerId_item_idx" ON "ProviderPrice"("providerId", "item");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPriceLink_token_key" ON "ProviderPriceLink"("token");

-- CreateIndex
CREATE INDEX "ProviderPriceLink_providerId_idx" ON "ProviderPriceLink"("providerId");

-- CreateIndex
CREATE INDEX "ProviderChange_providerId_createdAt_idx" ON "ProviderChange"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderFeedback_providerId_createdAt_idx" ON "ProviderFeedback"("providerId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProviderPrice" ADD CONSTRAINT "ProviderPrice_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderPriceLink" ADD CONSTRAINT "ProviderPriceLink_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderChange" ADD CONSTRAINT "ProviderChange_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderFeedback" ADD CONSTRAINT "ProviderFeedback_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
