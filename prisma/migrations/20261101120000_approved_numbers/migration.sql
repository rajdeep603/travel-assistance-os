-- Numbers an operator approved for AI calls while the app runs (a prospect's
-- mobile at the booth), on top of the configured OUTBOUND_ALLOWED_NUMBERS.
CREATE TABLE "ApprovedNumber" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "label" TEXT,
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovedNumber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApprovedNumber_number_key" ON "ApprovedNumber"("number");
