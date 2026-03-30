import nodemailer from "nodemailer";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

type SendEmailResult =
  | { status: "sent" }
  | { status: "skipped" }
  | { status: "failed"; error: string };

function getEmailConfig() {
  const user = process.env.EMAIL_USER || "";
  const pass = process.env.EMAIL_PASS || "";
  const allowSelfSigned =
    process.env.EMAIL_ALLOW_SELF_SIGNED === "true" ||
    process.env.NODE_ENV !== "production";
  const from = process.env.EMAIL_FROM || (user ? `OuttaCouch <${user}>` : "");

  if (!user || !pass || !from) {
    return null;
  }

  return { user, pass, from, allowSelfSigned };
}

export async function sendEmail({ to, subject, text }: SendEmailInput): Promise<SendEmailResult> {
  const config = getEmailConfig();
  if (!config) {
    return { status: "skipped" as const };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: config.user,
        pass: config.pass
      },
      tls: config.allowSelfSigned ? { rejectUnauthorized: false } : undefined
    });

    await transporter.sendMail({
      from: config.from,
      to,
      subject,
      text
    });

    return { status: "sent" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email send failed";
    console.error("SMTP send error", message);
    return { status: "failed", error: message };
  }
}
