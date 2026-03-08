import { NextResponse, type NextRequest } from "next/server";
import { format } from "date-fns";
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

