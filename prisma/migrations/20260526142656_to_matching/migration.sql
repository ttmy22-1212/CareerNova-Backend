-- AlterTable
ALTER TABLE "job_skills" ADD COLUMN     "lib_version" VARCHAR(20),
ADD COLUMN     "model_name" VARCHAR(100),
ADD COLUMN     "raw_skill_name" VARCHAR(255),
ADD COLUMN     "reason" VARCHAR(50),
ADD COLUMN     "similarity_score" DECIMAL(4,3);

-- AlterTable
ALTER TABLE "user_cv_skills" ADD COLUMN     "raw_skill" VARCHAR(255);

-- CreateTable
CREATE TABLE "search_group_keywords" (
    "id" SERIAL NOT NULL,
    "group_key" VARCHAR(255) NOT NULL,
    "keyword" VARCHAR(255) NOT NULL,

    CONSTRAINT "search_group_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unmatched_skills" (
    "unmatched_id" SERIAL NOT NULL,
    "raw_skill_name" VARCHAR(255) NOT NULL,
    "occurrence_count" INTEGER DEFAULT 1,
    "max_similarity_score" DECIMAL(4,3),
    "analysis_type" VARCHAR(50),
    "first_seen" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "top_candidate_skill_id" INTEGER,
    "top_candidate_skill_name" VARCHAR(255),

    CONSTRAINT "unmatched_skills_pkey" PRIMARY KEY ("unmatched_id")
);

-- CreateTable
CREATE TABLE "unmatched_skill_sources" (
    "source_id" BIGINT NOT NULL,
    "unmatched_id" INTEGER NOT NULL,
    "source_type" VARCHAR(50) NOT NULL,
    "occurrence_count" INTEGER DEFAULT 1,
    "max_similarity_score" DECIMAL(4,3),
    "first_seen" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unmatched_skill_sources_pkey" PRIMARY KEY ("source_id","unmatched_id","source_type")
);

-- CreateIndex
CREATE UNIQUE INDEX "search_group_keywords_keyword_key" ON "search_group_keywords"("keyword");

-- CreateIndex
CREATE INDEX "idx_search_group_keywords_keyword" ON "search_group_keywords"("keyword");

-- CreateIndex
CREATE UNIQUE INDEX "unmatched_skills_raw_skill_name_key" ON "unmatched_skills"("raw_skill_name");

-- CreateIndex
CREATE INDEX "idx_unmatched_skills_analysis_type" ON "unmatched_skills"("analysis_type");

-- CreateIndex
CREATE INDEX "idx_unmatched_skills_raw_name" ON "unmatched_skills"("raw_skill_name");

-- CreateIndex
CREATE INDEX "idx_jobs_skills_search" ON "jobs"("skills_desc");

-- CreateIndex
CREATE INDEX "idx_user_auth_providers_user_id" ON "user_auth_providers"("user_id");

-- AddForeignKey
ALTER TABLE "unmatched_skills" ADD CONSTRAINT "unmatched_skills_top_candidate_skill_id_fkey" FOREIGN KEY ("top_candidate_skill_id") REFERENCES "skills"("skill_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unmatched_skill_sources" ADD CONSTRAINT "unmatched_skill_sources_unmatched_id_fkey" FOREIGN KEY ("unmatched_id") REFERENCES "unmatched_skills"("unmatched_id") ON DELETE CASCADE ON UPDATE CASCADE;
