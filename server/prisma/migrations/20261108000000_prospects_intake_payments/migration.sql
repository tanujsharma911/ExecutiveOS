-- Prospects, Discovery Call Framework Books, discovery calls and PayPal intake payments.

-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('NEW', 'IN_DISCUSSION', 'NOT_A_FIT', 'INVITED', 'CONVERTED');
CREATE TYPE "CallMode" AS ENUM ('ONLINE', 'OFFLINE');
CREATE TYPE "CallOutcome" AS ENUM ('PENDING', 'GOOD_FIT', 'NOT_A_FIT', 'UNDECIDED');
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "intakeToken" TEXT;
ALTER TABLE "Program" ADD COLUMN "priceCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "company" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "industry" TEXT NOT NULL DEFAULT '',
    "companySize" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "links" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "ProspectStatus" NOT NULL DEFAULT 'NEW',
    "notFitReason" TEXT,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscoveryBook" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL DEFAULT '',
    "content" JSONB NOT NULL,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryBook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProspectBook" (
    "prospectId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectBook_pkey" PRIMARY KEY ("prospectId","bookId")
);

CREATE TABLE "DiscoveryCall" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "mode" "CallMode" NOT NULL DEFAULT 'ONLINE',
    "meetingLink" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "fitCheck" JSONB NOT NULL DEFAULT '[]',
    "outcome" "CallOutcome" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryCall_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntakePayment" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "prospectId" TEXT,
    "programId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paypalOrderId" TEXT NOT NULL,
    "paypalCaptureId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IntakePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_intakeToken_key" ON "User"("intakeToken");
CREATE UNIQUE INDEX "Prospect_clientId_key" ON "Prospect"("clientId");
CREATE INDEX "Prospect_coachId_idx" ON "Prospect"("coachId");
CREATE INDEX "DiscoveryBook_coachId_idx" ON "DiscoveryBook"("coachId");
CREATE INDEX "DiscoveryCall_prospectId_idx" ON "DiscoveryCall"("prospectId");
CREATE UNIQUE INDEX "IntakePayment_paypalOrderId_key" ON "IntakePayment"("paypalOrderId");
CREATE UNIQUE INDEX "IntakePayment_clientId_key" ON "IntakePayment"("clientId");
CREATE INDEX "IntakePayment_coachId_idx" ON "IntakePayment"("coachId");

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscoveryBook" ADD CONSTRAINT "DiscoveryBook_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProspectBook" ADD CONSTRAINT "ProspectBook_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProspectBook" ADD CONSTRAINT "ProspectBook_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "DiscoveryBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscoveryCall" ADD CONSTRAINT "DiscoveryCall_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntakePayment" ADD CONSTRAINT "IntakePayment_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntakePayment" ADD CONSTRAINT "IntakePayment_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IntakePayment" ADD CONSTRAINT "IntakePayment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntakePayment" ADD CONSTRAINT "IntakePayment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
