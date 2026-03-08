import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/sendEmail";

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

  try {
    await prisma.otpToken.create({
      data: {
        contact,
        codeHash,
        purpose: body.purpose ?? "signup",
        expiresAt
      }
    });
  } catch (error) {
    console.error("Failed to store OTP", error);
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 502 }
    );
  }

  if ((body.type ?? "email") === "email") {
    try {
      const result = await sendEmail({
        to: contact,
        subject: "Your OUTTACOUCH verification code",
        text: `Your OTP is ${code}. It expires in 10 minutes.`
      });

      if (result.status === "skipped") {
        return NextResponse.json(
          { error: "Email service not configured" },
          { status: 500 }
        );
      }
    } catch (error) {
      console.error("Failed to send OTP email", error);
      return NextResponse.json(
        { error: "Failed to send OTP email" },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ status: "sent" });
}
