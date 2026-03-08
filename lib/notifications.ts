import { sendEmail } from "@/lib/sendEmail";

export const sendNotificationEmail = async ({
  to,
  subject,
  text
}: {
  to: string;
  subject: string;
  text: string;
}) => {
  return sendEmail({ to, subject, text });
};
