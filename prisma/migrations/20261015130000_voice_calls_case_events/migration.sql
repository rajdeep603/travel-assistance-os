-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CallChannel" AS ENUM ('PHONE', 'BROWSER');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('QUEUED', 'RINGING', 'IN_PROGRESS', 'COMPLETED', 'TRANSFERRED', 'VOICEMAIL', 'NO_ANSWER', 'BUSY', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CaseEventType" AS ENUM ('CALL', 'EMAIL', 'FAX', 'LETTER_OF_GUARANTEE', 'NOTE', 'STATUS', 'APPOINTMENT', 'DOCUMENT', 'CLAIM');

-- AlterEnum
ALTER TYPE "ConversationChannel" ADD VALUE 'PHONE';

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "channel" "CallChannel" NOT NULL,
    "agentProfile" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'QUEUED',
    "twilioCallSid" TEXT,
    "fromNumber" TEXT,
    "toNumber" TEXT,
    "language" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "outcome" JSONB,
    "summary" TEXT,
    "transferredTo" TEXT,
    "bridgeId" TEXT,
    "placedBy" TEXT,
    "conversationId" TEXT,
    "caseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "CaseEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Call_ref_key" ON "Call"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Call_twilioCallSid_key" ON "Call"("twilioCallSid");

-- CreateIndex
CREATE UNIQUE INDEX "Call_conversationId_key" ON "Call"("conversationId");

-- CreateIndex
CREATE INDEX "Call_caseId_idx" ON "Call"("caseId");

-- CreateIndex
CREATE INDEX "Call_status_idx" ON "Call"("status");

-- CreateIndex
CREATE INDEX "Call_bridgeId_idx" ON "Call"("bridgeId");

-- CreateIndex
CREATE INDEX "CaseEvent_caseId_createdAt_idx" ON "CaseEvent"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Human-readable call refs (CALL-1001…), like the other ref sequences.
CREATE SEQUENCE IF NOT EXISTS call_ref_seq;
SELECT setval('call_ref_seq', GREATEST(1000, COALESCE((SELECT MAX(CAST(substring(ref from '([0-9]+)$') AS INTEGER)) FROM "Call"), 1000)));
