/*
  Warnings:

  - A unique constraint covering the columns `[event_id,user_id]` on the table `event_attendees` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "contact_imports" DROP CONSTRAINT "contact_imports_registered_user_id_fkey";

-- DropForeignKey
ALTER TABLE "contact_imports" DROP CONSTRAINT "contact_imports_user_id_fkey";

-- DropForeignKey
ALTER TABLE "contact_invitations" DROP CONSTRAINT "contact_invitations_from_user_id_fkey";

-- DropForeignKey
ALTER TABLE "contact_invitations" DROP CONSTRAINT "contact_invitations_registered_user_id_fkey";

-- DropForeignKey
ALTER TABLE "referral_links" DROP CONSTRAINT "referral_links_from_user_id_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "recommendations_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reminders_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "notification_schedules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_id" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "send_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_schedules_user_id_event_id_type_send_at_key" ON "notification_schedules"("user_id", "event_id", "type", "send_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_attendees_event_id_user_id_key" ON "event_attendees"("event_id", "user_id");

-- AddForeignKey
ALTER TABLE "notification_schedules" ADD CONSTRAINT "notification_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_schedules" ADD CONSTRAINT "notification_schedules_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_imports" ADD CONSTRAINT "contact_imports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_imports" ADD CONSTRAINT "contact_imports_registered_user_id_fkey" FOREIGN KEY ("registered_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_invitations" ADD CONSTRAINT "contact_invitations_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_invitations" ADD CONSTRAINT "contact_invitations_registered_user_id_fkey" FOREIGN KEY ("registered_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_links" ADD CONSTRAINT "referral_links_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
