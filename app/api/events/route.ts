import { NextResponse, type NextRequest } from "next/server";
import { format } from "date-fns";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const user = token?.sub
      ? await prisma.user.findUnique({
          where: { id: token.sub },
          select: { lat: true, lng: true, preferences: true }
        })
      : null;

    const events = await prisma.event.findMany({
      orderBy: { eventDate: "asc" },
      take: 50
    });

    type EventRow = (typeof events)[number];
    const eventIds = events.map((event: EventRow) => event.id);
    let connectionEventIds = new Set<string>();

    if (token?.sub) {
      const connections = await prisma.connection.findMany({
        where: {
          status: "accepted",
          OR: [{ user1Id: token.sub }, { user2Id: token.sub }]
        }
      });
      const connectionIds = connections.map((connection: (typeof connections)[number]) =>
        connection.user1Id === token.sub ? connection.user2Id : connection.user1Id
      );

      if (connectionIds.length > 0 && eventIds.length > 0) {
        const sharedAttendance = await prisma.eventAttendee.findMany({
          where: {
            userId: { in: connectionIds },
            eventId: { in: eventIds }
          },
          select: { eventId: true }
        });
        connectionEventIds = new Set(
          sharedAttendance.map((item: (typeof sharedAttendance)[number]) => item.eventId)
        );
      }
    }

    const now = Date.now();
    const scored = events.map((event: EventRow) => {
      const daysUntil = Math.max(
        0,
        Math.floor((event.eventDate.getTime() - now) / (1000 * 60 * 60 * 24))
      );
      const timeProximity = Math.max(0, 7 - daysUntil) / 7;
      const popularity = Math.min(
        1,
        event.currentAttendees / Math.max(1, event.maxAttendees)
      );
      const recency =
        Math.max(
          0,
          30 -
            Math.floor((now - event.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        ) / 30;

      let locationProximity = 0.5;
      if (user && user.lat !== null && user.lng !== null && event.lat && event.lng) {
        const toRad = (value: number) => (value * Math.PI) / 180;
        const r = 6371;
        const userLat = Number(user.lat);
        const userLng = Number(user.lng);
        const dLat = toRad(Number(event.lat) - userLat);
        const dLng = toRad(Number(event.lng) - userLng);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(userLat)) *
            Math.cos(toRad(Number(event.lat))) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = r * c;
        locationProximity = Math.exp(-distance / 10);
      }

      const categoryMatch = user?.preferences?.includes(event.category) ? 1 : 0;
      const connectionsAttending = connectionEventIds.has(event.id) ? 1 : 0;

      const score =
        locationProximity * 0.3 +
        categoryMatch * 0.25 +
        timeProximity * 0.15 +
        connectionsAttending * 0.15 +
        popularity * 0.1 +
        recency * 0.05;

      return {
        id: event.id,
        title: event.title,
        category: event.category,
        date: format(event.eventDate, "MMM d, yyyy"),
        location: event.address,
        imageUrl: event.coverImageUrl,
        lat: event.lat ? Number(event.lat) : null,
        lng: event.lng ? Number(event.lng) : null,
        score
      };
    });

    scored.sort((a: (typeof scored)[number], b: (typeof scored)[number]) => b.score - a.score);

    return NextResponse.json({ events: scored });
  } catch (error) {
    return NextResponse.json({ events: [] });
  }
}

type CreateEventBody = {
  title: string;
  descriptionShort: string;
  descriptionFull: string;
  category: string;
  eventDate: string;
  startTime: string;
  endDate?: string;
  endTime?: string;
  venueName: string;
  address: string;
  lat: number;
  lng: number;
  isFree: boolean;
  ticketPrice?: number;
  maxAttendees: number;
  coverImageUrl: string;
};

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileComplete = (token as { profileComplete?: boolean }).profileComplete;
  if (!profileComplete) {
    return NextResponse.json({ error: "Profile incomplete" }, { status: 403 });
  }

  const body = (await request.json()) as CreateEventBody;
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
  const endDate = body.endDate || body.eventDate;
  const endTime = body.endTime
    ? new Date(`${endDate}T${body.endTime}:00`)
    : null;

  const event = await prisma.event.create({
    data: {
      hostId: token.sub,
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
      currency: "INR",
      maxAttendees: body.maxAttendees,
      currentAttendees: 0,
      approvalMode: "auto",
      visibility: "public",
      coverImageUrl:
        body.coverImageUrl ||
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
      status: "upcoming"
    }
  });

  const recentCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const recentAttendees = await prisma.eventAttendee.findMany({
    where: {
      event: {
        category: event.category,
        eventDate: { gte: recentCutoff }
      }
    },
    select: { userId: true },
    distinct: ["userId"]
  });

  const attendedUserIds = new Set(recentAttendees.map((item) => item.userId));

  const candidates = await prisma.user.findMany({
    where: {
      id: { not: token.sub },
      isDeactivated: false,
      recommendationsEnabled: true,
      OR: [
        { preferences: { has: event.category } },
        { id: { in: Array.from(attendedUserIds) } }
      ]
    },
    select: {
      id: true,
      preferences: true,
      lat: true,
      lng: true
    },
    take: 250
  });

  const toRad = (value: number) => (value * Math.PI) / 180;
  const isNear = (lat?: number | null, lng?: number | null) => {
    if (lat === null || lng === null || lat === undefined || lng === undefined) {
      return false;
    }
    if (!event.lat || !event.lng) {
      return false;
    }
    const r = 6371;
    const dLat = toRad(Number(event.lat) - Number(lat));
    const dLng = toRad(Number(event.lng) - Number(lng));
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(Number(lat))) *
        Math.cos(toRad(Number(event.lat))) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = r * c;
    return distance <= 10;
  };

  const notifyUserIds = candidates
    .filter((user) => {
      const prefMatch = user.preferences.includes(event.category);
      const attendedMatch = attendedUserIds.has(user.id);
      const nearMatch = isNear(user.lat ? Number(user.lat) : null, user.lng ? Number(user.lng) : null);
      return prefMatch || attendedMatch || nearMatch;
    })
    .map((user) => user.id);

  if (notifyUserIds.length > 0) {
    const existing = await prisma.notification.findMany({
      where: {
        userId: { in: notifyUserIds },
        link: `/events/${event.id}`,
        title: "New event you might like"
      },
      select: { userId: true }
    });
    const existingIds = new Set(existing.map((item) => item.userId));
    const notifications = notifyUserIds
      .filter((userId) => !existingIds.has(userId))
      .map((userId) => ({
        userId,
        title: "New event you might like",
        body: `${event.title} · ${event.descriptionShort ?? "Check it out"}`,
        link: `/events/${event.id}`
      }));

    if (notifications.length > 0) {
      await prisma.notification.createMany({ data: notifications });
    }
  }

  return NextResponse.json({ id: event.id });
}
