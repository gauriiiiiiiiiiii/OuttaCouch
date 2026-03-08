import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request) {
  const token = await getToken({ req: request as any, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const user = await prisma.user.update({
    where: { id: token.sub },
    data: {
      city: body.city ?? undefined,
      lat: body.lat ?? undefined,
      lng: body.lng ?? undefined
    }
  });

  return NextResponse.json({ user });
}
