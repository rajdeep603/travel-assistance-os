-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "medicalLimit" DECIMAL(12,2) NOT NULL,
    "medicalUsed" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "benefits" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Policy_number_key" ON "Policy"("number");

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_number_fkey" FOREIGN KEY ("number") REFERENCES "Patient"("policyNumber") ON DELETE RESTRICT ON UPDATE CASCADE;

