-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "input" JSONB NOT NULL,
    "oneTimeTotal" DECIMAL(12,2) NOT NULL,
    "monthlyCost" DECIMAL(12,2) NOT NULL,
    "firstYearCost" DECIMAL(12,2) NOT NULL,
    "netAnnualSaving" DECIMAL(14,2) NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_ref_key" ON "Lead"("ref");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_quoteNumber_idx" ON "Lead"("quoteNumber");


-- Lead refs (LEAD-1001)
CREATE SEQUENCE IF NOT EXISTS lead_ref_seq START WITH 1001 MINVALUE 1;
