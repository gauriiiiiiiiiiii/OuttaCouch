import { NextResponse } from "next/server";
import crypto from "crypto";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

type SendOtpBody = {
  contact: string;
  type?: "email" | "phone";
  purpose?: "signup" | "reset";
};

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export async function POST(request: Request) {
  const body = (await request.json()) as SendOtpBody;
  const contact = body.contact?.trim();

  if (!contact) {
    return NextResponse.json({ error: "Contact required" }, { status: 400 });
  }

  const code = (Math.floor(100000 + Math.random() * 900000)).toString();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.otpToken.create({
    data: {
      contact,
      codeHash,
      purpose: body.purpose ?? "signup",
      expiresAt
    }
  });

  if ((body.type ?? "email") === "email") {
    const resendApiKey = process.env.RESEND_API_KEY || "";
    const fromAddress =
      process.env.RESEND_FROM || "OUTTACOUCH <onboarding@resend.dev>";

    if (!resendApiKey || !fromAddress) {
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 500 }
      );
    }

    try {
      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: fromAddress,
        to: contact,
        subject: "Your OUTTACOUCH verification code",
        text: `Your OTP is ${code}. It expires in 10 minutes.`
      });
    } catch (error) {
      return NextResponse.json(
        { error: "Failed to send OTP email" },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ status: "sent" });
}
