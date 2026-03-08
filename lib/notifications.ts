import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY || "";
const from = process.env.RESEND_FROM || "";

const resend = apiKey ? new Resend(apiKey) : null;

export const sendNotificationEmail = async ({
  to,
  subject,
  text
}: {
  to: string;
  subject: string;
  text: string;
}) => {
  if (!resend || !from) {
    return { status: "skipped" };
  }

  await resend.emails.send({
    from,
    to,
    subject,
    text
  });

  return { status: "sent" };
};
