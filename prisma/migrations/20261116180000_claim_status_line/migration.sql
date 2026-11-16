-- The claim status line: brokers on policies, the treating provider on claims.
ALTER TABLE "Policy" ADD COLUMN "brokerName" TEXT;
ALTER TABLE "Policy" ADD COLUMN "brokerCode" TEXT;
ALTER TABLE "Policy" ADD COLUMN "brokerEmail" TEXT;
ALTER TABLE "Claim" ADD COLUMN "providerName" TEXT;
