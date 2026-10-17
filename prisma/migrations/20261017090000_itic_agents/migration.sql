-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('COMMERCIAL', 'COMMERCIAL_ESCORTED', 'COMMERCIAL_STRETCHER', 'AIR_AMBULANCE', 'NOT_FIT_TO_FLY');

-- CreateEnum
CREATE TYPE "TransportStatus" AS ENUM ('ASSESSED', 'QUOTES_REQUESTED', 'BOOKED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "CaseEventType" ADD VALUE 'TRANSPORT';

-- AlterTable
ALTER TABLE "BillReview" ADD COLUMN     "agreedAmount" DECIMAL(12,2),
ADD COLUMN     "agreement" JSONB;

-- CreateTable
CREATE TABLE "TransportPlan" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "callRef" TEXT,
    "assessment" JSONB NOT NULL,
    "mode" "TransportMode" NOT NULL,
    "reasons" TEXT[],
    "options" JSONB NOT NULL,
    "currency" TEXT NOT NULL,
    "estimateLow" DECIMAL(12,2) NOT NULL,
    "estimateHigh" DECIMAL(12,2) NOT NULL,
    "status" "TransportStatus" NOT NULL DEFAULT 'ASSESSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportPlan_ref_key" ON "TransportPlan"("ref");

-- CreateIndex
CREATE INDEX "TransportPlan_caseId_idx" ON "TransportPlan"("caseId");

-- AddForeignKey
ALTER TABLE "TransportPlan" ADD CONSTRAINT "TransportPlan_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Medical transport plan refs (MT-1001)
CREATE SEQUENCE IF NOT EXISTS transport_ref_seq;
