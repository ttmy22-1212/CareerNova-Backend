-- Reconcile CareerNova-Backend migrations with the authoritative skills schema
-- (JobVisualization_BE/Db/schema.sql). These columns already exist on the shared
-- production DB, so use IF NOT EXISTS to stay safe on both fresh and existing DBs.
ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "is_software" BOOLEAN DEFAULT false;
ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "is_language" BOOLEAN DEFAULT false;
ALTER TABLE "skills" ADD COLUMN IF NOT EXISTS "category_name" VARCHAR(255);
