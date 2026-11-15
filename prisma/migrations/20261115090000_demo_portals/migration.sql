-- Private, time-limited partner demo portals and their usage log.
CREATE TABLE "DemoPortal" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "kit" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "emailDomain" TEXT,
    "hostContact" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "minuteBudget" INTEGER NOT NULL DEFAULT 60,
    "sessionSeconds" INTEGER NOT NULL DEFAULT 300,
    "maxConcurrent" INTEGER NOT NULL DEFAULT 2,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoPortal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DemoPortalEvent" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "viewer" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoPortalEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DemoPortal_token_key" ON "DemoPortal"("token");
CREATE INDEX "DemoPortalEvent_portalId_createdAt_idx" ON "DemoPortalEvent"("portalId", "createdAt");

ALTER TABLE "DemoPortalEvent" ADD CONSTRAINT "DemoPortalEvent_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "DemoPortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
