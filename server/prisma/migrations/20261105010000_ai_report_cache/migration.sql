-- CreateTable
CREATE TABLE "AiReport" (
    "clientId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "report" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiReport_pkey" PRIMARY KEY ("clientId")
);

-- AddForeignKey
ALTER TABLE "AiReport" ADD CONSTRAINT "AiReport_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
