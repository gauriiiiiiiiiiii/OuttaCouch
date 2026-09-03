import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeContact } from "@/lib/normalizeContact";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { isSameOrigin } from "@/lib/csrf";
import { validatePassword } from "@/lib/password";

type ResetBody = {
  contact: string;
  password: string;
  token: string;
};

export async function POST(request: Request) {
  // CSRF
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit: 5 password resets per IP per 15 minutes
  const ip = getClientIp(request);
  const rl = rateLimit(`reset-password:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) }
      }
    );
  }

  const body = (await request.json()) as ResetBody;
  const contact = normalizeContact(body.contact);

  if (!contact || !body.password || !body.token) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const passwordError = validatePassword(body.password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
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
