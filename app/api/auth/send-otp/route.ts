import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { normalizeContact } from "@/lib/normalizeContact";
import { sendEmail } from "@/lib/sendEmail";
import { startVerification } from "@/lib/twilioVerify";
import { prisma } from "@/lib/prisma";

type SendOtpBody = {
  contact: string;
  type?: "email" | "phone";
  purpose?: "signup" | "reset";
};

const otpLifetimeMs = 5 * 60 * 1000;
const resendCooldownMs = 30 * 1000;

function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: Request) {
  const body = (await request.json()) as SendOtpBody;
  const rawContact = body.contact?.trim() || "";
  const isEmail = rawContact.includes("@");
  const inferredType = isEmail ? "email" : "phone";
  const type = body.type ?? inferredType;
  const contact = normalizeContact(body.contact);

  if (!contact) {
    return NextResponse.json({ error: "Contact required" }, { status: 400 });
  }

  if (type === "email" && !isEmail) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  if (type === "phone" && isEmail) {
    return NextResponse.json({ error: "Phone number required" }, { status: 400 });
  }

  const purpose = body.purpose ?? "signup";
  const latestToken = await prisma.otpToken.findFirst({
    where: { contact, purpose, usedAt: null },
    orderBy: { createdAt: "desc" }
  });

  if (latestToken && Date.now() - latestToken.createdAt.getTime() < resendCooldownMs) {
    return NextResponse.json(
      { error: "Please wait before requesting another code." },
      { status: 429 }
    );
  }

  if (type === "email") {
    const code = generateOtpCode();
    const emailResult = await sendEmail({
      to: contact,
      subject: "Your OuttaCouch verification code",
      text: `Your verification code is ${code}. It expires in 5 minutes.`
    });

    if (emailResult.status === "skipped") {
      return NextResponse.json(
        { error: "Email not configured" },
        { status: 503 }
      );
    }

    if (emailResult.status === "failed") {
      return NextResponse.json(
        { error: emailResult.error || "Failed to send OTP" },
        { status: 502 }
      );
    }

    try {
      const codeHash = await bcrypt.hash(code, 10);
      await prisma.otpToken.create({
        data: {
          contact,
          codeHash,
          purpose,
          expiresAt: new Date(Date.now() + otpLifetimeMs)
        }
      });
    } catch (error) {
      console.error("Failed to store OTP session", error);
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 502 }
      );
    }
  }

  if (type === "phone") {
    const smsResult = await startVerification(contact, "sms");
    if (smsResult.status === "sent") {
      try {
        await prisma.otpToken.create({
          data: {
            contact,
            codeHash: "",
            purpose,
            verificationSid: smsResult.sid ?? undefined,
            expiresAt: new Date(Date.now() + otpLifetimeMs)
          }
        });
      } catch (error) {
        console.error("Failed to store OTP session", error);
        return NextResponse.json(
          { error: "Database unavailable" },
          { status: 502 }
        );
      }
      return NextResponse.json({ status: "sent" });
    }

    const whatsappResult = await startVerification(contact, "whatsapp");
    if (whatsappResult.status === "sent") {
      try {
        await prisma.otpToken.create({
          data: {
            contact,
            codeHash: "",
            purpose,
            verificationSid: whatsappResult.sid ?? undefined,
            expiresAt: new Date(Date.now() + otpLifetimeMs)
          }
        });
      } catch (error) {
        console.error("Failed to store OTP session", error);
        return NextResponse.json(
          { error: "Database unavailable" },
          { status: 502 }
        );
      }
      return NextResponse.json({ status: "sent" });
    }

    const errorMessage =
      smsResult.error ||
      whatsappResult.error ||
      (smsResult.status === "skipped" || whatsappResult.status === "skipped"
        ? "Twilio Verify not configured"
        : "Failed to send OTP");

    console.error("Twilio phone/whatsapp verification failed", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }

  return NextResponse.json({ status: "sent" });
}
