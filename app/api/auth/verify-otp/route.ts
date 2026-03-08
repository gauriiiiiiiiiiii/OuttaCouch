import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

type VerifyOtpBody = {
  contact: string;
  otp: string;
  purpose?: "signup" | "reset";
};

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export async function POST(request: Request) {
  const body = (await request.json()) as VerifyOtpBody;
  const contact = body.contact?.trim();
  const otp = body.otp?.trim();

  if (!contact || !otp) {
    return NextResponse.json({ error: "Contact and OTP required" }, { status: 400 });
  }

  const token = await prisma.otpToken.findFirst({
    where: {
      contact,
      purpose: body.purpose ?? "signup",
      usedAt: null
    },
    orderBy: { createdAt: "desc" }
  });

  if (!token || token.expiresAt < new Date()) {
    return NextResponse.json({ error: "OTP expired" }, { status: 400 });
  }

  const match = token.codeHash === hashCode(otp);
  if (!match) {
    return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
  }

  const verified = await prisma.otpToken.update({
    where: { id: token.id },
    data: { verifiedAt: new Date() }
  });

  return NextResponse.json({ status: "verified", token: verified.id });
}
