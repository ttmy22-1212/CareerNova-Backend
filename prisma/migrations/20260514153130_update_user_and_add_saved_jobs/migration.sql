-- AlterTable
ALTER TABLE "users" ADD COLUMN     "current_step" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "current_year" INTEGER,
ADD COLUMN     "major" VARCHAR(255),
ADD COLUMN     "objective" VARCHAR(255),
ADD COLUMN     "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "orientation" VARCHAR(255),
ADD COLUMN     "school" VARCHAR(255);

-- CreateTable
CREATE TABLE "saved_jobs" (
    "saved_job_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "job_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("saved_job_id")
);

-- CreateIndex
CREATE INDEX "idx_saved_jobs_user_id" ON "saved_jobs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_jobs_user_id_job_id_key" ON "saved_jobs"("user_id", "job_id");

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;
