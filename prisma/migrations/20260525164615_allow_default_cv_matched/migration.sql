-- CreateTable
CREATE TABLE "users" (
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(255),
    "email" VARCHAR(255),
    "password_hash" TEXT,
    "avatar_url" TEXT,
    "role" VARCHAR(50) NOT NULL DEFAULT 'student',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "verify_token" TEXT,
    "verify_token_expires" TIMESTAMP(6),
    "school" VARCHAR(255),
    "major" VARCHAR(255),
    "current_year" INTEGER,
    "orientation" VARCHAR(255),
    "objective" VARCHAR(255),
    "target_salary" INTEGER,
    "prefer_remote" BOOLEAN,
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "default_cv_id" UUID,
    "default_match_id" UUID,
    "allow_default_cv_matching" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_auth_providers" (
    "auth_provider_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "provider_user_id" VARCHAR(255) NOT NULL,
    "provider_email" VARCHAR(255),
    "provider_name" VARCHAR(255),
    "provider_avatar_url" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(6),

    CONSTRAINT "user_auth_providers_pkey" PRIMARY KEY ("auth_provider_id")
);

-- CreateTable
CREATE TABLE "user_cvs" (
    "cv_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "file_name" VARCHAR(255),
    "file_url" TEXT,
    "extracted_text" TEXT,
    "uploaded_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_cvs_pkey" PRIMARY KEY ("cv_id")
);

-- CreateTable
CREATE TABLE "skills" (
    "skill_id" SERIAL NOT NULL,
    "skill_name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(255),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "type" VARCHAR(100),
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("skill_id")
);

-- CreateTable
CREATE TABLE "user_cv_skills" (
    "cv_id" UUID NOT NULL,
    "skill_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_cv_skills_pkey" PRIMARY KEY ("cv_id","skill_id")
);

-- CreateTable
CREATE TABLE "companies" (
    "company_id" BIGINT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "company_size_min" INTEGER,
    "company_size_max" INTEGER,
    "country" VARCHAR(100),
    "city" VARCHAR(100),
    "address" TEXT,
    "url" VARCHAR(500),
    "industry" VARCHAR(255),
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("company_id")
);

-- CreateTable
CREATE TABLE "industries" (
    "industry_id" SERIAL NOT NULL,
    "industry_name" VARCHAR(255) NOT NULL,

    CONSTRAINT "industries_pkey" PRIMARY KEY ("industry_id")
);

-- CreateTable
CREATE TABLE "company_industries" (
    "company_id" BIGINT NOT NULL,
    "industry_id" INTEGER NOT NULL,

    CONSTRAINT "company_industries_pkey" PRIMARY KEY ("company_id","industry_id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "job_id" BIGSERIAL NOT NULL,
    "company_id" BIGINT,
    "title" VARCHAR(500) NOT NULL,
    "skills_desc" TEXT,
    "description" TEXT,
    "formatted_experience_level" VARCHAR(100),
    "work_type" VARCHAR(100),
    "location" VARCHAR(255),
    "is_remote" BOOLEAN DEFAULT false,
    "listed_time" TIMESTAMPTZ(6),
    "expiry_time" TIMESTAMPTZ(6),
    "job_posting_url" TEXT,
    "scraped_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "applies" INTEGER DEFAULT 0,
    "views" INTEGER DEFAULT 0,
    "fingerprint" VARCHAR(32),
    "job_category" VARCHAR(100),
    "search_group" VARCHAR(100),
    "source_name" VARCHAR(50),
    "source_id" VARCHAR(255),
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("job_id")
);

-- CreateTable
CREATE TABLE "salaries" (
    "salary_id" SERIAL NOT NULL,
    "job_id" BIGINT,
    "min_salary" DECIMAL(18,2),
    "max_salary" DECIMAL(18,2),
    "med_salary" DECIMAL(18,2),
    "currency" VARCHAR(10) DEFAULT 'VND',
    "pay_period" VARCHAR(20),

    CONSTRAINT "salaries_pkey" PRIMARY KEY ("salary_id")
);

-- CreateTable
CREATE TABLE "job_skills" (
    "job_id" BIGINT NOT NULL,
    "skill_id" INTEGER NOT NULL,
    "is_inferred" BOOLEAN DEFAULT false,

    CONSTRAINT "job_skills_pkey" PRIMARY KEY ("job_id","skill_id")
);

-- CreateTable
CREATE TABLE "benefits" (
    "benefit_id" SERIAL NOT NULL,
    "benefit_name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benefits_pkey" PRIMARY KEY ("benefit_id")
);

-- CreateTable
CREATE TABLE "job_benefits" (
    "job_id" BIGINT NOT NULL,
    "benefit_id" INTEGER NOT NULL,
    "is_inferred" BOOLEAN DEFAULT false,

    CONSTRAINT "job_benefits_pkey" PRIMARY KEY ("job_id","benefit_id")
);

-- CreateTable
CREATE TABLE "job_group_skill_weights" (
    "search_group" VARCHAR(100) NOT NULL,
    "skill_id" INTEGER NOT NULL,
    "weight_wi" DECIMAL(8,4) NOT NULL,

    CONSTRAINT "job_group_skill_weights_pkey" PRIMARY KEY ("search_group","skill_id")
);

-- CreateTable
CREATE TABLE "cv_job_matches" (
    "match_id" UUID NOT NULL,
    "cv_id" UUID NOT NULL,
    "match_type" VARCHAR(50) NOT NULL,
    "search_group" VARCHAR(100),
    "job_id" BIGINT,
    "match_score" DECIMAL(5,2),
    "radar_data" JSONB,
    "gap_report" JSONB,
    "model_version" VARCHAR(100),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_job_matches_pkey" PRIMARY KEY ("match_id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "template_id" UUID NOT NULL,
    "template_code" VARCHAR(100) NOT NULL,
    "channel" VARCHAR(30) NOT NULL DEFAULT 'in_app',
    "type" VARCHAR(50) NOT NULL DEFAULT 'system',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "title_template" VARCHAR(255) NOT NULL,
    "message_template" TEXT NOT NULL,
    "action_url_template" TEXT,
    "metadata_schema" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("template_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL DEFAULT 'system',
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "action_url" TEXT,
    "entity_type" VARCHAR(50),
    "entity_id" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'unread',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(6),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "saved_jobs" (
    "saved_job_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "job_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("saved_job_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_default_cv_id_key" ON "users"("default_cv_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_default_match_id_key" ON "users"("default_match_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_auth_providers_provider_provider_user_id_key" ON "user_auth_providers"("provider", "provider_user_id");

-- CreateIndex
CREATE INDEX "idx_user_cvs_user_id" ON "user_cvs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "skills_skill_name_key" ON "skills"("skill_name");

-- CreateIndex
CREATE INDEX "idx_user_cv_skills_skill_id" ON "user_cv_skills"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "industries_industry_name_key" ON "industries"("industry_name");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_fingerprint_key" ON "jobs"("fingerprint");

-- CreateIndex
CREATE INDEX "idx_jobs_company_id" ON "jobs"("company_id");

-- CreateIndex
CREATE INDEX "idx_jobs_experience" ON "jobs"("formatted_experience_level");

-- CreateIndex
CREATE INDEX "idx_jobs_expiry_time" ON "jobs"("expiry_time");

-- CreateIndex
CREATE INDEX "idx_jobs_job_category" ON "jobs"("job_category");

-- CreateIndex
CREATE INDEX "idx_jobs_listed_time" ON "jobs"("listed_time");

-- CreateIndex
CREATE INDEX "idx_jobs_search_group" ON "jobs"("search_group");

-- CreateIndex
CREATE INDEX "idx_jobs_source_name" ON "jobs"("source_name");

-- CreateIndex
CREATE INDEX "idx_jobs_title" ON "jobs"("title");

-- CreateIndex
CREATE INDEX "idx_salaries_job_id" ON "salaries"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "benefits_benefit_name_key" ON "benefits"("benefit_name");

-- CreateIndex
CREATE INDEX "idx_cv_job_matches_created_at" ON "cv_job_matches"("created_at");

-- CreateIndex
CREATE INDEX "idx_cv_job_matches_cv_id" ON "cv_job_matches"("cv_id");

-- CreateIndex
CREATE INDEX "idx_cv_job_matches_job_id" ON "cv_job_matches"("job_id");

-- CreateIndex
CREATE INDEX "idx_cv_job_matches_match_type" ON "cv_job_matches"("match_type");

-- CreateIndex
CREATE INDEX "idx_cv_job_matches_search_group" ON "cv_job_matches"("search_group");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_template_code_key" ON "notification_templates"("template_code");

-- CreateIndex
CREATE INDEX "idx_notification_templates_active" ON "notification_templates"("is_active");

-- CreateIndex
CREATE INDEX "idx_notifications_entity" ON "notifications"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_notifications_user_created_at" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_notifications_user_is_read" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "idx_notifications_user_status" ON "notifications"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_saved_jobs_user_id" ON "saved_jobs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_jobs_user_id_job_id_key" ON "saved_jobs"("user_id", "job_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_default_cv_id_fkey" FOREIGN KEY ("default_cv_id") REFERENCES "user_cvs"("cv_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_default_match_id_fkey" FOREIGN KEY ("default_match_id") REFERENCES "cv_job_matches"("match_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_auth_providers" ADD CONSTRAINT "user_auth_providers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cvs" ADD CONSTRAINT "user_cvs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cv_skills" ADD CONSTRAINT "user_cv_skills_cv_id_fkey" FOREIGN KEY ("cv_id") REFERENCES "user_cvs"("cv_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cv_skills" ADD CONSTRAINT "user_cv_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("skill_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_industries" ADD CONSTRAINT "company_industries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_industries" ADD CONSTRAINT "company_industries_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "industries"("industry_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salaries" ADD CONSTRAINT "salaries_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("skill_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_benefits" ADD CONSTRAINT "job_benefits_benefit_id_fkey" FOREIGN KEY ("benefit_id") REFERENCES "benefits"("benefit_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_benefits" ADD CONSTRAINT "job_benefits_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_group_skill_weights" ADD CONSTRAINT "job_group_skill_weights_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("skill_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_job_matches" ADD CONSTRAINT "cv_job_matches_cv_id_fkey" FOREIGN KEY ("cv_id") REFERENCES "user_cvs"("cv_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_job_matches" ADD CONSTRAINT "cv_job_matches_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("job_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
