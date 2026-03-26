import { NextResponse } from "next/server";
import { normalizeContact } from "@/lib/normalizeContact";
import { startVerification } from "@/lib/twilioVerify";
import { prisma } from "@/lib/prisma";

type SendOtpBody = {
  contact: string;
  type?: "email" | "phone";
  purpose?: "signup" | "reset";
};

const otpLifetimeMs = 5 * 60 * 1000;
const resendCooldownMs = 30 * 1000;

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
    const emailResult = await startVerification(contact, "email");
    if (emailResult.status === "skipped") {
      return NextResponse.json(
        { error: emailResult.error || "Twilio Verify not configured" },
        { status: 500 }
      );
    }
    if (emailResult.status === "failed") {
      return NextResponse.json({ error: "Failed to send OTP" }, { status: 502 });
    }

    try {
      await prisma.otpToken.create({
        data: {
          contact,
          codeHash: "",
          purpose,
          verificationSid: emailResult.sid ?? undefined,
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
        return NextResponse.json(
          { error: "Database unavailable" },
          { status: 502 }
        );
      }
      return NextResponse.json({ status: "sent" });
    }

    const errorMessage =
      smsResult.error || whatsappResult.error || "Failed to send OTP";
    return NextResponse.json({ error: "Failed to send OTP" }, { status: 502 });
  }

  return NextResponse.json({ status: "sent" });
}
