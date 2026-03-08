import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = await prisma.event.findUnique({ where: { id: params.id } });
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!event.isFree) {
    return NextResponse.json({ error: "Paid event" }, { status: 403 });
  }

  const existing = await prisma.eventAttendee.findFirst({
    where: { eventId: event.id, userId: token.sub }
  });

  if (existing) {
    return NextResponse.json({ status: "already-committed" });
  }

  if (event.currentAttendees >= event.maxAttendees) {
    return NextResponse.json({ error: "Event full" }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.eventAttendee.create({
      data: {
        eventId: event.id,
        userId: token.sub,
        status: "committed"
      }
    }),
    prisma.event.update({
      where: { id: event.id },
      data: { currentAttendees: { increment: 1 } }
    })
  ]);

  return NextResponse.json({ status: "committed" });
}
