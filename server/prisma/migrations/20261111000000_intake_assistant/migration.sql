-- Intake assistant: chat transcripts, coach payment policies, "what's included", coach-approved prospect note

ALTER TABLE "User" ADD COLUMN "refundPolicy" TEXT NOT NULL DEFAULT '', ADD COLUMN "paymentContact" TEXT NOT NULL DEFAULT '';
UPDATE "User" SET "refundPolicy" = 'There are no refunds: all payments are final.' WHERE "role" = 'COACH' AND "refundPolicy" = '';
ALTER TABLE "Program" ADD COLUMN "included" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Prospect" ADD COLUMN "intakeNote" TEXT NOT NULL DEFAULT '';

CREATE TABLE "IntakeChat" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "prospectId" TEXT,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "selectedProgramId" TEXT,
    "notifiedUnanswered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntakeChat_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IntakeChat_coachId_idx" ON "IntakeChat"("coachId");
CREATE INDEX "IntakeChat_prospectId_idx" ON "IntakeChat"("prospectId");
ALTER TABLE "IntakeChat" ADD CONSTRAINT "IntakeChat_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntakeChat" ADD CONSTRAINT "IntakeChat_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IntakePayment" ADD COLUMN "chatId" TEXT;
ALTER TABLE "IntakePayment" ADD CONSTRAINT "IntakePayment_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "IntakeChat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
