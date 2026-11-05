-- Coaching focus, goals and challenges were removed from client profiles.
ALTER TABLE "ClientProfile" DROP COLUMN "focusArea",
DROP COLUMN "goals",
DROP COLUMN "challenges";
