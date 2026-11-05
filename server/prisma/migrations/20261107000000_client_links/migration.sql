-- Links a client adds to their profile (LinkedIn, company site, talks, …) as [{ "label": "...", "url": "..." }].
ALTER TABLE "ClientProfile" ADD COLUMN "links" JSONB NOT NULL DEFAULT '[]';
