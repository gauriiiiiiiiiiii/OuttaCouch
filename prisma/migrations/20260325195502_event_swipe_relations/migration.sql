-- AlterTable
ALTER TABLE "otp_tokens" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verification_sid" TEXT;

-- AddForeignKey
ALTER TABLE "event_swipes" ADD CONSTRAINT "event_swipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_swipes" ADD CONSTRAINT "event_swipes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
