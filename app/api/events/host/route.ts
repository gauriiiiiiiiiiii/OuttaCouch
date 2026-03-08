import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = await prisma.event.findMany({
    where: { hostId: token.sub },
    orderBy: { eventDate: "desc" },
    include: { _count: { select: { attendees: true } } }
  });

  const data = events.map((event: (typeof events)[number]) => ({
    id: event.id,
    title: event.title,
    date: format(event.eventDate, "MMM d, yyyy"),
    attendeeCount: event._count.attendees
  }));

  return NextResponse.json({ events: data });
}
