-- CreateEnum
CREATE TYPE "BillReviewStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'WAIVED');

-- AlterEnum
ALTER TYPE "CaseEventType" ADD VALUE 'BILL_REVIEW';

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "signals" JSONB;

-- AlterTable
ALTER TABLE "DocumentExtraction" ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "lineItems" JSONB;

-- CreateTable
CREATE TABLE "BillReview" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "caseId" TEXT,
    "claimId" TEXT,
    "guaranteeLetterId" TEXT,
    "kind" "DocumentKind" NOT NULL,
    "hospital" TEXT,
    "currency" TEXT NOT NULL,
    "billed" DECIMAL(12,2) NOT NULL,
    "recommended" DECIMAL(12,2) NOT NULL,
    "savings" DECIMAL(12,2) NOT NULL,
    "savingsEur" DECIMAL(12,2),
    "result" JSONB NOT NULL,
    "ruleset" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "status" "BillReviewStatus" NOT NULL DEFAULT 'PROPOSED',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillReview_documentId_key" ON "BillReview"("documentId");

-- CreateIndex
CREATE INDEX "BillReview_caseId_idx" ON "BillReview"("caseId");

-- CreateIndex
CREATE INDEX "BillReview_claimId_idx" ON "BillReview"("claimId");

-- CreateIndex
CREATE INDEX "BillReview_createdAt_idx" ON "BillReview"("createdAt");

-- CreateIndex
CREATE INDEX "DocumentExtraction_documentNumber_idx" ON "DocumentExtraction"("documentNumber");

-- AddForeignKey
ALTER TABLE "BillReview" ADD CONSTRAINT "BillReview_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillReview" ADD CONSTRAINT "BillReview_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillReview" ADD CONSTRAINT "BillReview_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillReview" ADD CONSTRAINT "BillReview_guaranteeLetterId_fkey" FOREIGN KEY ("guaranteeLetterId") REFERENCES "GuaranteeLetter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

