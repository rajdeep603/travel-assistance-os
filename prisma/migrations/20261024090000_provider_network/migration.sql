-- CreateEnum
CREATE TYPE "ProviderKind" AS ENUM ('CLINIC', 'HOSPITAL', 'TELEMEDICINE', 'AIR_AMBULANCE', 'GROUND_AMBULANCE');

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "accreditations" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "kind" "ProviderKind" NOT NULL DEFAULT 'CLINIC',
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "rateCard" JSONB;

-- CreateTable
CREATE TABLE "ProviderMerge" (
    "id" TEXT NOT NULL,
    "keptId" TEXT NOT NULL,
    "removedId" TEXT NOT NULL,
    "moved" JSONB NOT NULL,
    "reasons" TEXT[],
    "score" DOUBLE PRECISION NOT NULL,
    "mergedBy" TEXT NOT NULL,
    "undoneAt" TIMESTAMP(3),
    "undoneBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderMerge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderMerge_keptId_idx" ON "ProviderMerge"("keptId");

-- CreateIndex
CREATE INDEX "ProviderMerge_createdAt_idx" ON "ProviderMerge"("createdAt");

-- CreateIndex
CREATE INDEX "Provider_mergedIntoId_idx" ON "Provider"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
