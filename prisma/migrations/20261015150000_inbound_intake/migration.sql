-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('UPLOAD', 'EMAIL', 'FAX', 'GENERATED');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'FAX', 'SMS');

-- CreateEnum
CREATE TYPE "InboundStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'MATCHED', 'NEEDS_REVIEW', 'REPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboundStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentKind" ADD VALUE 'COST_ESTIMATE';
ALTER TYPE "DocumentKind" ADD VALUE 'GUARANTEE_LETTER';
ALTER TYPE "DocumentKind" ADD VALUE 'CORRESPONDENCE';

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "inboundMessageId" TEXT,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "ocr" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" "DocumentSource" NOT NULL DEFAULT 'UPLOAD',
ADD COLUMN     "translatedText" TEXT;

-- CreateTable
CREATE TABLE "InboundMessage" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "externalId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT,
    "subject" TEXT,
    "bodyText" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "InboundStatus" NOT NULL DEFAULT 'RECEIVED',
    "language" TEXT,
    "matchedCaseId" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "matchReasons" JSONB,
    "riskFlags" TEXT[],
    "summary" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "OutboundStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT,
    "providerMessageId" TEXT,
    "error" TEXT,
    "automatic" BOOLEAN NOT NULL DEFAULT true,
    "approvedBy" TEXT,
    "attachmentDocumentId" TEXT,
    "caseId" TEXT,
    "inReplyToId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_ref_key" ON "InboundMessage"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_externalId_key" ON "InboundMessage"("externalId");

-- CreateIndex
CREATE INDEX "InboundMessage_status_idx" ON "InboundMessage"("status");

-- CreateIndex
CREATE INDEX "InboundMessage_matchedCaseId_idx" ON "InboundMessage"("matchedCaseId");

-- CreateIndex
CREATE INDEX "OutboundMessage_caseId_idx" ON "OutboundMessage"("caseId");

-- CreateIndex
CREATE INDEX "OutboundMessage_inReplyToId_idx" ON "OutboundMessage"("inReplyToId");

-- CreateIndex
CREATE INDEX "Document_inboundMessageId_idx" ON "Document"("inboundMessageId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_inboundMessageId_fkey" FOREIGN KEY ("inboundMessageId") REFERENCES "InboundMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_matchedCaseId_fkey" FOREIGN KEY ("matchedCaseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_inReplyToId_fkey" FOREIGN KEY ("inReplyToId") REFERENCES "InboundMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Human-readable message refs (MSG-1001…).
CREATE SEQUENCE IF NOT EXISTS message_ref_seq;
SELECT setval('message_ref_seq', GREATEST(1000, COALESCE((SELECT MAX(CAST(substring(ref from '([0-9]+)$') AS INTEGER)) FROM "InboundMessage"), 1000)));
