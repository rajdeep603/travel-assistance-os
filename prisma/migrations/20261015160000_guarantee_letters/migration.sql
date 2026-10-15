-- CreateEnum
CREATE TYPE "GuaranteeStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'ACKNOWLEDGED', 'REJECTED');

-- CreateTable
CREATE TABLE "GuaranteeLetter" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "providerId" TEXT,
    "hospitalName" TEXT NOT NULL,
    "estimateDocumentId" TEXT,
    "estimatedAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "guaranteedAmount" DECIMAL(12,2) NOT NULL,
    "excess" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "conditions" TEXT[],
    "flags" TEXT[],
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "GuaranteeStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "rejectionReason" TEXT,
    "pdfDocumentId" TEXT,
    "sentVia" "MessageChannel",
    "sentTo" TEXT,
    "sentAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "decisionTrace" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuaranteeLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuaranteeLetter_ref_key" ON "GuaranteeLetter"("ref");

-- CreateIndex
CREATE INDEX "GuaranteeLetter_caseId_idx" ON "GuaranteeLetter"("caseId");

-- AddForeignKey
ALTER TABLE "GuaranteeLetter" ADD CONSTRAINT "GuaranteeLetter_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuaranteeLetter" ADD CONSTRAINT "GuaranteeLetter_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Human-readable letter refs (LOG-1001…).
CREATE SEQUENCE IF NOT EXISTS guarantee_ref_seq;
SELECT setval('guarantee_ref_seq', GREATEST(1000, COALESCE((SELECT MAX(CAST(substring(ref from '([0-9]+)$') AS INTEGER)) FROM "GuaranteeLetter"), 1000)));
