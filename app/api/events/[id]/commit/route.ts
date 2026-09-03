import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = token.sub;

  const event = await prisma.event.findUnique({ where: { id } });
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

  // Capacity is enforced by a single conditional UPDATE, so two different
  // users racing for the last seat are serialised by the row lock: the loser's
  // UPDATE matches zero rows and the whole transaction (including the attendee
  // insert) rolls back. UNIQUE(eventId, userId) handles the same user twice.
  const committed = await prisma.$transaction(async (tx) => {
    await tx.eventAttendee.create({
      data: {
        eventId: event.id,
        userId,
        status: "committed"
      }
    });

    const claimedSeats = await tx.$executeRaw`
      UPDATE "events"
      SET "current_attendees" = "current_attendees" + 1
      WHERE "id" = ${event.id} AND "current_attendees" < "max_attendees"
    `;

    if (claimedSeats === 0) {
      throw new Error("EVENT_FULL");
    }

    return event.id;
  }).catch((err: unknown) => {
    const error = err as { message?: string; code?: string };
    if (error.message === "EVENT_FULL") {
      return "FULL" as const;
    }
    // Unique (eventId, userId) violation: two concurrent commits from the same
    // user. The first one won, so report the idempotent outcome instead of 500.
    if (error.code === "P2002") {
      return "DUPLICATE" as const;
    }
    throw err;
  });

  if (committed === "FULL") {
    return NextResponse.json({ error: "Event full" }, { status: 409 });
  }

  if (committed === "DUPLICATE") {
    return NextResponse.json({ status: "already-committed" });
  }

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const attendee = await prisma.eventAttendee.findFirst({
    where: { eventId: id, userId: token.sub }
  });

  if (!attendee) {
    return NextResponse.json({ error: "Not committed" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.eventAttendee.delete({ where: { id: attendee.id } }),
    // Guard against the counter drifting below zero.
    prisma.event.updateMany({
      where: { id, currentAttendees: { gt: 0 } },
      data: { currentAttendees: { decrement: 1 } }
    }),
    // Cancelling attendance also cancels any reminders not yet sent.
    prisma.notificationSchedule.deleteMany({
      where: { userId: token.sub, eventId: id, sentAt: null }
    })
  ]);

  return NextResponse.json({ status: "cancelled" });
}
