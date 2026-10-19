-- Meeting notes on a lead: segment, pains, chosen pilot, notes, next step, follow-up sent
ALTER TABLE "Lead" ADD COLUMN "segment" TEXT,
ADD COLUMN "pains" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "pilot" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "nextStep" TEXT,
ADD COLUMN "nextStepOn" DATE,
ADD COLUMN "followUpSentAt" TIMESTAMP(3);
