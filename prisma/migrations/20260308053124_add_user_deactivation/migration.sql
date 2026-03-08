-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deactivated_at" TIMESTAMP(3),
ADD COLUMN     "is_deactivated" BOOLEAN NOT NULL DEFAULT false;
