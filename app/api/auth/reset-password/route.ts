import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

type ResetBody = {
  contact: string;
  password: string;
  token: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as ResetBody;
  const contact = body.contact?.trim();

  if (!contact || !body.password || !body.token) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const otpToken = await prisma.otpToken.findUnique({
    where: { id: body.token }
  });

  if (!otpToken || otpToken.contact !== contact || !otpToken.verifiedAt) {
    return NextResponse.json({ error: "OTP not verified" }, { status: 400 });
  }

  if (otpToken.usedAt) {
    return NextResponse.json({ error: "OTP already used" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: contact }, { phone: contact }]
    }
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const hashed = await bcrypt.hash(body.password, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashed }
  });

  await prisma.otpToken.update({
    where: { id: otpToken.id },
    data: { usedAt: new Date() }
  });

  return NextResponse.json({ status: "reset" });
}
