-- When a lead agreed to hear from us by e-mail, and who recorded it.
ALTER TABLE "Lead" ADD COLUMN "contactConsentAt" TIMESTAMP(3),
ADD COLUMN "contactConsentBy" TEXT;

-- Visitors gave it on the QR page, which doesn't take their details without the tick.
UPDATE "Lead" SET "contactConsentAt" = "createdAt", "contactConsentBy" = 'visitor' WHERE "source" = 'VISITOR';
