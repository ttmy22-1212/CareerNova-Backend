/*
  Warnings:

  - The primary key for the `cv_job_matches` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `notification_templates` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `notifications` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `user_auth_providers` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `user_cv_skills` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `user_cvs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `users` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `match_id` on the `cv_job_matches` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `cv_id` on the `cv_job_matches` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `template_id` on the `notification_templates` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `notification_id` on the `notifications` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `user_id` on the `notifications` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `auth_provider_id` on the `user_auth_providers` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `user_id` on the `user_auth_providers` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `cv_id` on the `user_cv_skills` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `cv_id` on the `user_cvs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `user_id` on the `user_cvs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `user_id` on the `users` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "cv_job_matches" DROP CONSTRAINT "cv_job_matches_cv_id_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_user_id_fkey";

-- DropForeignKey
ALTER TABLE "user_auth_providers" DROP CONSTRAINT "user_auth_providers_user_id_fkey";

-- DropForeignKey
ALTER TABLE "user_cv_skills" DROP CONSTRAINT "user_cv_skills_cv_id_fkey";

-- DropForeignKey
ALTER TABLE "user_cvs" DROP CONSTRAINT "user_cvs_user_id_fkey";

-- AlterTable
ALTER TABLE "cv_job_matches" DROP CONSTRAINT "cv_job_matches_pkey",
DROP COLUMN "match_id",
ADD COLUMN     "match_id" UUID NOT NULL,
DROP COLUMN "cv_id",
ADD COLUMN     "cv_id" UUID NOT NULL,
ADD CONSTRAINT "cv_job_matches_pkey" PRIMARY KEY ("match_id");

-- AlterTable
ALTER TABLE "notification_templates" DROP CONSTRAINT "notification_templates_pkey",
DROP COLUMN "template_id",
ADD COLUMN     "template_id" UUID NOT NULL,
ADD CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("template_id");

-- AlterTable
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_pkey",
DROP COLUMN "notification_id",
ADD COLUMN     "notification_id" UUID NOT NULL,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
ALTER COLUMN "entity_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id");

-- AlterTable
ALTER TABLE "user_auth_providers" DROP CONSTRAINT "user_auth_providers_pkey",
DROP COLUMN "auth_provider_id",
ADD COLUMN     "auth_provider_id" UUID NOT NULL,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
ADD CONSTRAINT "user_auth_providers_pkey" PRIMARY KEY ("auth_provider_id");

-- AlterTable
ALTER TABLE "user_cv_skills" DROP CONSTRAINT "user_cv_skills_pkey",
DROP COLUMN "cv_id",
ADD COLUMN     "cv_id" UUID NOT NULL,
ADD CONSTRAINT "user_cv_skills_pkey" PRIMARY KEY ("cv_id", "skill_id");

-- AlterTable
ALTER TABLE "user_cvs" DROP CONSTRAINT "user_cvs_pkey",
DROP COLUMN "cv_id",
ADD COLUMN     "cv_id" UUID NOT NULL,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
ADD CONSTRAINT "user_cvs_pkey" PRIMARY KEY ("cv_id");

-- AlterTable
ALTER TABLE "users" DROP CONSTRAINT "users_pkey",
DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
ADD CONSTRAINT "users_pkey" PRIMARY KEY ("user_id");

-- CreateIndex
CREATE INDEX "idx_cv_job_matches_cv_id" ON "cv_job_matches"("cv_id");

-- CreateIndex
CREATE INDEX "idx_notifications_user_created_at" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_notifications_user_is_read" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "idx_notifications_user_status" ON "notifications"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_user_cvs_user_id" ON "user_cvs"("user_id");

-- AddForeignKey
ALTER TABLE "user_auth_providers" ADD CONSTRAINT "user_auth_providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cvs" ADD CONSTRAINT "user_cvs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cv_skills" ADD CONSTRAINT "user_cv_skills_cv_id_fkey" FOREIGN KEY ("cv_id") REFERENCES "user_cvs"("cv_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_job_matches" ADD CONSTRAINT "cv_job_matches_cv_id_fkey" FOREIGN KEY ("cv_id") REFERENCES "user_cvs"("cv_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
