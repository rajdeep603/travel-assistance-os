-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "familyContactLanguage" TEXT,
ADD COLUMN     "familyContactName" TEXT,
ADD COLUMN     "familyContactPhone" TEXT,
ADD COLUMN     "familyContactRelation" TEXT,
ADD COLUMN     "familyUpdates" BOOLEAN NOT NULL DEFAULT false;
