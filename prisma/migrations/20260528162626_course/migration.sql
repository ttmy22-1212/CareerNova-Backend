-- CreateTable
CREATE TABLE "courses" (
    "course_id" UUID NOT NULL,
    "course_title" VARCHAR(500) NOT NULL,
    "provider_name" VARCHAR(100) NOT NULL,
    "source_url" TEXT,
    "thumbnail_icon" VARCHAR(50),
    "duration_hours" INTEGER NOT NULL,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 4.5,
    "total_learners" VARCHAR(50) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "skills_tags" TEXT[],
    "is_recommended" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("course_id")
);

-- CreateTable
CREATE TABLE "learning_paths" (
    "path_id" UUID NOT NULL,
    "path_title" VARCHAR(255) NOT NULL,
    "path_description" TEXT NOT NULL,
    "path_level" VARCHAR(50) NOT NULL DEFAULT 'Intermediate',
    "path_icon" VARCHAR(50) NOT NULL DEFAULT 'rocket',
    "estimated_duration_months" VARCHAR(50) NOT NULL DEFAULT '2 months',
    "skill_key" VARCHAR(255) NOT NULL,

    CONSTRAINT "learning_paths_pkey" PRIMARY KEY ("path_id")
);

-- CreateTable
CREATE TABLE "path_courses" (
    "path_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "path_courses_pkey" PRIMARY KEY ("path_id","course_id")
);

-- CreateTable
CREATE TABLE "saved_courses" (
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'saved',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_courses_pkey" PRIMARY KEY ("user_id","course_id")
);

-- AddForeignKey
ALTER TABLE "path_courses" ADD CONSTRAINT "path_courses_path_id_fkey" FOREIGN KEY ("path_id") REFERENCES "learning_paths"("path_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_courses" ADD CONSTRAINT "path_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_courses" ADD CONSTRAINT "saved_courses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_courses" ADD CONSTRAINT "saved_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE CASCADE ON UPDATE CASCADE;
