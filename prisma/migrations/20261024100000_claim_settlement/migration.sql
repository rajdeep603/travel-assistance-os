-- AlterEnum
ALTER TYPE "DocumentKind" ADD VALUE 'EXPLANATION_OF_BENEFITS';

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "eobDocumentId" TEXT,
ADD COLUMN     "settlement" JSONB;
