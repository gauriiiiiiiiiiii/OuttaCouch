import { NextResponse, type NextRequest } from "next/server";
import { format } from "date-fns";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      host: true,
      images: true,
      _count: { select: { attendees: true } },
      attendees: { include: { user: true, ticket: true } },
      tickets: true
    }
  });

  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const revenueTotal = event.tickets.reduce(
    (sum: number, ticket: (typeof event.tickets)[number]) =>
      sum + Number(ticket.amountPaid || 0),
    0
  );

  const attendeeSeriesMap = event.attendees.reduce<Record<string, number>>(
    (acc: Record<string, number>, attendee: (typeof event.attendees)[number]) => {
      const key = format(attendee.createdAt, "MMM d");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const revenueSeriesMap = event.tickets.reduce<Record<string, number>>(
    (acc: Record<string, number>, ticket: (typeof event.tickets)[number]) => {
      const key = format(ticket.createdAt, "MMM d");
      acc[key] = (acc[key] ?? 0) + Number(ticket.amountPaid || 0);
      return acc;
    },
    {}
  );

  const attendeeSeries = Object.entries(attendeeSeriesMap).map(([date, count]) => ({
    date,
    count
  }));
  const revenueSeries = Object.entries(revenueSeriesMap).map(([date, total]) => ({
    date,
    total
  }));

  return NextResponse.json({
    id: event.id,
    title: event.title,
    description: event.descriptionFull,
    category: event.category,
    date: format(event.eventDate, "MMM d, yyyy"),
    time: `${format(event.startTime, "hh:mm a")} ${event.endTime ? `- ${format(event.endTime, "hh:mm a")}` : ""}`.trim(),
    venueName: event.venueName,
    address: event.address,
    lat: event.lat ? Number(event.lat) : null,
    lng: event.lng ? Number(event.lng) : null,
    coverImageUrl: event.coverImageUrl,
    images: event.images.map((image) => ({
      id: image.id,
      imageUrl: image.imageUrl,
      isCover: image.isCover,
      orderIndex: image.orderIndex
    })),
    isFree: event.isFree,
    ticketPrice: event.ticketPrice?.toString() ?? null,
    host: {
      id: event.host.id,
      name: event.host.displayName ?? event.host.email ?? "Host",
      photo: event.host.profilePhotoUrl
    },
    attendeeCount: event._count.attendees,
    attendees: event.attendees.map((attendee: (typeof event.attendees)[number]) => ({
      id: attendee.id,
      name: attendee.user.displayName ?? attendee.user.email ?? "User",
      status: attendee.status,
      ticketId: attendee.ticketId
    })),
    revenueTotal,
    analytics: {
      attendeeSeries,
      revenueSeries
    }
  });
}

type UpdateEventBody = {
  title: string;
  descriptionShort?: string;
  descriptionFull?: string;
  category: string;
  eventDate: string;
  startTime: string;
  endTime?: string;
  venueName: string;
  address: string;
  lat: number;
  lng: number;
  isFree: boolean;
  ticketPrice?: number;
  maxAttendees: number;
  coverImageUrl?: string;
};

export async function PUT(
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

  if (event.hostId !== token.sub) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const body = (await request.json()) as UpdateEventBody;
  if (
    !body.title ||
    !body.category ||
    !body.eventDate ||
    !body.startTime ||
    !body.venueName ||
    !body.address ||
    body.lat === undefined ||
    body.lng === undefined ||
    !body.maxAttendees
  ) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const eventDate = new Date(`${body.eventDate}T00:00:00`);
  const startTime = new Date(`${body.eventDate}T${body.startTime}:00`);
  const endTime = body.endTime
    ? new Date(`${body.eventDate}T${body.endTime}:00`)
    : null;

  const updated = await prisma.event.update({
    where: { id: params.id },
    data: {
      title: body.title,
      descriptionShort: body.descriptionShort || body.title,
      descriptionFull: body.descriptionFull || body.descriptionShort || body.title,
      category: body.category,
      eventDate,
      startTime,
      endTime,
      venueName: body.venueName,
      address: body.address,
      lat: body.lat,
      lng: body.lng,
      isFree: body.isFree,
      ticketPrice: body.isFree ? null : body.ticketPrice ?? null,
      maxAttendees: body.maxAttendees,
      coverImageUrl:
        body.coverImageUrl ||
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee"
    }
  });

  return NextResponse.json({ id: updated.id });
}

export async function DELETE(
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

  if (event.hostId !== token.sub) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.connection.updateMany({
      where: { sharedEventId: event.id },
      data: { sharedEventId: null }
    }),
    prisma.memory.updateMany({
      where: { eventId: event.id },
      data: { eventId: null }
    }),
    prisma.eventSwipe.deleteMany({ where: { eventId: event.id } }),
    prisma.eventImage.deleteMany({ where: { eventId: event.id } }),
    prisma.eventAttendee.deleteMany({ where: { eventId: event.id } }),
    prisma.ticket.deleteMany({ where: { eventId: event.id } }),
    prisma.event.delete({ where: { id: event.id } })
  ]);

  return NextResponse.json({ status: "deleted" });
}

