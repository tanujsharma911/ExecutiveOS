-- Auto-renewing programs through PayPal Subscriptions

CREATE TYPE "BillingType" AS ENUM ('ONE_TIME', 'SUBSCRIPTION');
CREATE TYPE "SubscriptionStatus" AS ENUM ('PAST_DUE', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

ALTER TABLE "Program"
  ADD COLUMN "billingType" "BillingType" NOT NULL DEFAULT 'ONE_TIME',
  ADD COLUMN "paypalProductId" TEXT,
  ADD COLUMN "paypalPlanId" TEXT,
  ADD COLUMN "paypalPlanKey" TEXT;

ALTER TABLE "ClientProfile"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "inactiveReason" TEXT;

ALTER TABLE "IntakePayment"
  ADD COLUMN "kind" "BillingType" NOT NULL DEFAULT 'ONE_TIME',
  ADD COLUMN "paypalSubscriptionId" TEXT,
  ALTER COLUMN "paypalOrderId" DROP NOT NULL;
CREATE UNIQUE INDEX "IntakePayment_paypalSubscriptionId_key" ON "IntakePayment"("paypalSubscriptionId");

CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "paypalSubscriptionId" TEXT NOT NULL,
    "paypalPlanId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "amountCents" INTEGER NOT NULL,
    "intervalWeeks" INTEGER NOT NULL,
    "failedPayments" INTEGER NOT NULL DEFAULT 0,
    "lastPaymentAt" TIMESTAMP(3),
    "nextBillingAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Subscription_clientId_key" ON "Subscription"("clientId");
CREATE UNIQUE INDEX "Subscription_paypalSubscriptionId_key" ON "Subscription"("paypalSubscriptionId");
CREATE INDEX "Subscription_coachId_idx" ON "Subscription"("coachId");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
