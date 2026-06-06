import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { isSameOrigin } from "@/lib/csrf";

type SwipeBody = {
  event_id: string;
  action: "right" | "left" | "up" | "down";
};

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SwipeBody;
  if (!body.event_id || !body.action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const existing = await prisma.eventSwipe.findFirst({
    where: { eventId: body.event_id, userId: token.sub }
  });

  if (existing) {
    await prisma.eventSwipe.update({
      where: { id: existing.id },
      data: { action: body.action }
    });
  } else {
    await prisma.eventSwipe.create({
      data: {
        eventId: body.event_id,
        userId: token.sub,
        action: body.action
      }
    });
  }

  return NextResponse.json({ status: "logged" });
}
