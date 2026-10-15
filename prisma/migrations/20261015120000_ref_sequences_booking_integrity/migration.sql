-- Human-readable refs come from sequences instead of a full-table MAX() scan,
-- so concurrent inserts can no longer race for the same number.
CREATE SEQUENCE IF NOT EXISTS case_ref_seq;
CREATE SEQUENCE IF NOT EXISTS claim_ref_seq;
CREATE SEQUENCE IF NOT EXISTS appointment_ref_seq;
CREATE SEQUENCE IF NOT EXISTS patient_ref_seq;

SELECT setval('case_ref_seq', GREATEST(1000, COALESCE((SELECT MAX(CAST(substring(ref from '([0-9]+)$') AS INTEGER)) FROM "Case"), 1000)));
SELECT setval('claim_ref_seq', GREATEST(10235, COALESCE((SELECT MAX(CAST(substring(ref from '([0-9]+)$') AS INTEGER)) FROM "Claim"), 10235)));
SELECT setval('appointment_ref_seq', GREATEST(1000, COALESCE((SELECT MAX(CAST(substring(ref from '([0-9]+)$') AS INTEGER)) FROM "Appointment"), 1000)));
SELECT setval('patient_ref_seq', GREATEST(1000, COALESCE((SELECT MAX(CAST(substring(ref from '([0-9]+)$') AS INTEGER)) FROM "Patient"), 1000)));

-- Before enforcing one live booking per provider slot, cancel any duplicates
-- an earlier race may have left behind (the oldest booking wins).
UPDATE "Appointment" AS a
SET "status" = 'CANCELLED',
    "notes" = TRIM(COALESCE(a."notes", '') || ' [auto-cancelled: duplicate slot]')
WHERE a."status" IN ('PENDING', 'CONFIRMED')
  AND EXISTS (
    SELECT 1 FROM "Appointment" AS b
    WHERE b."providerId" = a."providerId"
      AND b."scheduledAt" = a."scheduledAt"
      AND b."status" IN ('PENDING', 'CONFIRMED')
      AND (b."createdAt" < a."createdAt" OR (b."createdAt" = a."createdAt" AND b."id" < a."id"))
  );

-- One live (pending/confirmed) appointment per provider slot. Partial unique
-- indexes aren't expressible in schema.prisma, so this one lives only here.
CREATE UNIQUE INDEX "Appointment_provider_slot_live_key"
  ON "Appointment" ("providerId", "scheduledAt")
  WHERE "status" IN ('PENDING', 'CONFIRMED');

-- Foreign-key / lookup indexes.
CREATE INDEX "Appointment_providerId_scheduledAt_status_idx" ON "Appointment"("providerId", "scheduledAt", "status");
CREATE INDEX "Appointment_patientId_idx" ON "Appointment"("patientId");
CREATE INDEX "Appointment_caseId_idx" ON "Appointment"("caseId");
CREATE INDEX "Case_patientId_idx" ON "Case"("patientId");
CREATE INDEX "Claim_patientId_idx" ON "Claim"("patientId");
CREATE INDEX "Claim_caseId_idx" ON "Claim"("caseId");
CREATE INDEX "Document_claimId_idx" ON "Document"("claimId");
CREATE INDEX "Document_caseId_idx" ON "Document"("caseId");
CREATE INDEX "Conversation_caseId_idx" ON "Conversation"("caseId");

-- AI provenance: which provider (live model or offline rules) produced a result.
ALTER TABLE "DocumentExtraction" ADD COLUMN "aiSource" TEXT;
ALTER TABLE "Claim" ADD COLUMN "aiSource" TEXT;
