import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

type SwipeBody = {
  event_id: string;
  action: "right" | "left" | "up" | "down";
};

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SwipeBody;
  if (!body.event_id || !body.action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await prisma.eventSwipe.create({
    data: {
      eventId: body.event_id,
      userId: token.sub,
      action: body.action
    }
  });

  return NextResponse.json({ status: "logged" });
}
