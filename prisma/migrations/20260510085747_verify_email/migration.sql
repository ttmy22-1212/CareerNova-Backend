-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verify_token" TEXT,
ADD COLUMN     "verify_token_expires" TIMESTAMP(6);
