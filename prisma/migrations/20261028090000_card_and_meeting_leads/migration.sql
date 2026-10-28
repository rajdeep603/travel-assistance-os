-- Leads read from a photographed business card, and meetings booked before the
-- show (imported from a CSV) with the presenter's brief. Neither records
-- consent to e-mail. PostgreSQL 12+ adds both enum values in one migration.
ALTER TYPE "LeadSource" ADD VALUE 'CARD';
ALTER TYPE "LeadSource" ADD VALUE 'MEETING';

ALTER TABLE "Lead" ADD COLUMN "meetingAt" TIMESTAMP(3),
ADD COLUMN "brief" TEXT;

CREATE INDEX "Lead_meetingAt_idx" ON "Lead"("meetingAt");
