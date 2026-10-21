-- Visitor leads: visitors leave their own details on the booth's QR page (/meet), before any quotation
CREATE TYPE "LeadSource" AS ENUM ('QUOTATION', 'VISITOR');
ALTER TABLE "Lead" ADD COLUMN "source" "LeadSource" NOT NULL DEFAULT 'QUOTATION',
ADD COLUMN "role" TEXT,
ADD COLUMN "message" TEXT;
