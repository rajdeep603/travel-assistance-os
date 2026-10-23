-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PartnerKind" AS ENUM ('ASSISTANCE', 'CORRESPONDENT', 'INSURER');

-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('SENT', 'ACCEPTED', 'DECLINED', 'IN_PROGRESS', 'COMPLETED');

-- AlterEnum
ALTER TYPE "MessageChannel" ADD VALUE 'WHATSAPP';

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "vendorId" TEXT;

-- AlterTable
ALTER TABLE "TransportPlan" ADD COLUMN     "mission" JSONB,
ADD COLUMN     "quotes" JSONB;

-- CreateTable
CREATE TABLE "Receivable" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "facility" TEXT NOT NULL,
    "payerName" TEXT NOT NULL,
    "payerEmail" TEXT,
    "payerPhone" TEXT,
    "payerCountry" TEXT,
    "patientName" TEXT NOT NULL,
    "dateOfBirth" TEXT,
    "policyNumber" TEXT,
    "gopRef" TEXT,
    "gopAmount" DECIMAL(12,2),
    "invoiceNumber" TEXT NOT NULL,
    "diagnosis" TEXT,
    "serviceFrom" TEXT,
    "serviceTo" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lines" JSONB,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ReceivableStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "readiness" JSONB,
    "chases" JSONB NOT NULL DEFAULT '[]',
    "payerAnswer" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkPartner" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PartnerKind" NOT NULL,
    "country" TEXT NOT NULL,
    "regions" TEXT[],
    "services" TEXT[],
    "languages" TEXT[],
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "sla" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseHandoff" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "pack" JSONB NOT NULL,
    "token" TEXT NOT NULL,
    "status" "HandoffStatus" NOT NULL DEFAULT 'SENT',
    "updates" JSONB NOT NULL DEFAULT '[]',
    "sentBy" TEXT NOT NULL,
    "respondBy" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "statusCode" INTEGER,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receivable_ref_key" ON "Receivable"("ref");

-- CreateIndex
CREATE INDEX "Receivable_status_idx" ON "Receivable"("status");

-- CreateIndex
CREATE INDEX "Receivable_payerName_idx" ON "Receivable"("payerName");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkPartner_ref_key" ON "NetworkPartner"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "CaseHandoff_ref_key" ON "CaseHandoff"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "CaseHandoff_token_key" ON "CaseHandoff"("token");

-- CreateIndex
CREATE INDEX "CaseHandoff_caseId_idx" ON "CaseHandoff"("caseId");

-- CreateIndex
CREATE INDEX "CaseHandoff_partnerId_idx" ON "CaseHandoff"("partnerId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_endpointId_createdAt_idx" ON "WebhookDelivery"("endpointId", "createdAt");

-- CreateIndex
CREATE INDEX "Case_vendorId_idx" ON "Case"("vendorId");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "NetworkPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseHandoff" ADD CONSTRAINT "CaseHandoff_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseHandoff" ADD CONSTRAINT "CaseHandoff_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "NetworkPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ref sequences for receivables and hand-offs
CREATE SEQUENCE IF NOT EXISTS receivable_ref_seq;
CREATE SEQUENCE IF NOT EXISTS handoff_ref_seq;
