import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeContact } from "@/lib/normalizeContact";
import { checkVerification } from "@/lib/twilioVerify";

type VerifyOtpBody = {
  contact: string;
  otp: string;
  purpose?: "signup" | "reset";
};

const maxAttempts = 5;

export async function POST(request: Request) {
  const body = (await request.json()) as VerifyOtpBody;
  const contact = normalizeContact(body.contact);
  const otp = body.otp?.trim();

  if (!contact || !otp) {
    return NextResponse.json({ error: "Contact and OTP required" }, { status: 400 });
  }

  const purpose = body.purpose ?? "signup";
  const token = await prisma.otpToken.findFirst({
    where: {
      contact,
      purpose,
      usedAt: null
    },
    orderBy: { createdAt: "desc" }
  });

  if (!token) {
    return NextResponse.json({ error: "OTP expired" }, { status: 400 });
  }

  if (token.expiresAt < new Date()) {
    return NextResponse.json({ error: "OTP expired" }, { status: 400 });
  }

  if (token.attempts >= maxAttempts) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const verifyResult = await checkVerification(contact, otp);
  if (verifyResult.status === "skipped") {
    return NextResponse.json(
      { error: verifyResult.error || "Twilio Verify not configured" },
      { status: 500 }
    );
  }

  if (verifyResult.status === "failed") {
    const nextAttempts = token.attempts + 1;
    await prisma.otpToken.update({
      where: { id: token.id },
      data: {
        attempts: nextAttempts,
        usedAt: nextAttempts >= maxAttempts ? new Date() : undefined
      }
    });
    return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
  }

  const verified = await prisma.otpToken.update({
    where: { id: token.id },
    data: { verifiedAt: new Date() }
  });

  return NextResponse.json({ status: "verified", token: verified.id });
}
