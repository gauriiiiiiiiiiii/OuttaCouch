import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeContact } from "@/lib/normalizeContact";

type LoginBody = {
  contact: string;
  password: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as LoginBody;
  const contact = normalizeContact(body.contact);

  if (!contact || !body.password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ email: contact }, { phone: contact }]
    }
  });

  if (!user || user.isDeactivated) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const valid = await bcrypt.compare(body.password, user.passwordHash);

  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  return NextResponse.json({ status: "ok" });
}
