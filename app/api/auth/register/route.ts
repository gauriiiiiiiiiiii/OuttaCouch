import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeContact } from "@/lib/normalizeContact";

type RegisterBody = {
  contact: string;
  password: string;
  token: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as RegisterBody;
  const contact = normalizeContact(body.contact);

  if (!contact || !body.password || !body.token) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const otpToken = await prisma.otpToken.findUnique({
    where: { id: body.token }
  });

  if (!otpToken || otpToken.contact !== contact || !otpToken.verifiedAt) {
    return NextResponse.json({ error: "OTP not verified" }, { status: 400 });
  }

  if (otpToken.expiresAt < new Date()) {
    return NextResponse.json({ error: "OTP expired" }, { status: 400 });
  }

  if (otpToken.usedAt) {
    return NextResponse.json({ error: "OTP already used" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(body.password, 10);
  const isEmail = contact.includes("@");

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: contact }, { phone: contact }]
    }
  });

  if (existing) {
    return NextResponse.json({ error: "User already exists" }, { status: 400 });
  }

  const user = await prisma.user.create({
    data: {
      email: isEmail ? contact : null,
      phone: !isEmail ? contact : null,
      passwordHash: hashed,
      profileComplete: false,
      preferences: []
    }
  });

  await prisma.otpToken.update({
    where: { id: otpToken.id },
    data: { usedAt: new Date(), userId: user.id }
  });

  return NextResponse.json({ status: "registered" });
}
