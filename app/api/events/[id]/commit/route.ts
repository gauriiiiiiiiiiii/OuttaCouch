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

  const userId = token.sub;

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

  const user = await prisma.user.findUnique({
    where: { id: token.sub },
    select: { remindersEnabled: true }
  });

  if (user?.remindersEnabled) {
    const startAt = event.startTime ?? event.eventDate;
    const now = Date.now();
    const reminderOffsets = [
      { label: "1 day", ms: 24 * 60 * 60 * 1000 },
      { label: "1 hour", ms: 60 * 60 * 1000 },
      { label: "10 minutes", ms: 10 * 60 * 1000 }
    ];

    const startLabel = event.startTime
      ? event.startTime.toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short"
        })
      : event.eventDate.toLocaleDateString("en-US");
    const locationLabel = event.venueName ?? event.address ?? "the venue";

    const schedules = reminderOffsets
      .map((offset) => ({
        type: "event_reminder",
        sendAt: new Date(startAt.getTime() - offset.ms),
        label: offset.label
      }))
      .filter((item) => item.sendAt.getTime() > now)
      .map((item) => ({
        userId,
        eventId: event.id,
        type: item.type,
        title: "Upcoming Event Reminder",
        body: `Your event "${event.title}" starts in ${item.label} at ${locationLabel} (${startLabel}).`,
        link: `/events/${event.id}`,
        sendAt: item.sendAt
      }));

    if (schedules.length > 0) {
      await prisma.notificationSchedule.createMany({
        data: schedules,
        skipDuplicates: true
      });
    }
  }

  return NextResponse.json({ status: "committed" });
}
