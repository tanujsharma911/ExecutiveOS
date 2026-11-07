-- Discovery Call Book: one template per coach
ALTER TABLE "DiscoveryBook" ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false;
