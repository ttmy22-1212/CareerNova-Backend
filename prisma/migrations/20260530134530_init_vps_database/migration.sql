/*
  Warnings:

  - You are about to alter the column `verify_token` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.

*/
-- DropIndex
DROP INDEX "idx_jobs_skills_search";

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "verify_token" SET DATA TYPE VARCHAR(255);
