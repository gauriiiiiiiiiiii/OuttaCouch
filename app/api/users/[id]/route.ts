import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      displayName: true,
      bio: true,
      profilePhotoUrl: true,
      city: true,
      preferences: true,
      profileVisibility: true,
      isVerifiedHost: true
    }
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isSelf = token?.sub === user.id;
  const hasViewer = !!token?.sub && !isSelf;
  let connected = false;
  let viewerConnection: { id: string; status: string } | null = null;

  if (!isSelf) {
    if (user.profileVisibility === "private") {
      return NextResponse.json({ error: "Profile not available" }, { status: 403 });
    }

    if (user.profileVisibility === "connections") {
      if (!token?.sub) {
        return NextResponse.json({ error: "Profile not available" }, { status: 403 });
      }

      const connection = await prisma.connection.findFirst({
        where: {
          status: "accepted",
          OR: [
            { user1Id: token.sub, user2Id: user.id },
            { user1Id: user.id, user2Id: token.sub }
          ]
        }
      });

      connected = !!connection;
      viewerConnection = connection ? { id: connection.id, status: connection.status } : null;
      if (!connected) {
        return NextResponse.json({ error: "Profile not available" }, { status: 403 });
      }
    }
  }

  if (hasViewer && !connected) {
    const connection = await prisma.connection.findFirst({
      where: {
        OR: [
          { user1Id: token.sub as string, user2Id: user.id },
          { user1Id: user.id, user2Id: token.sub as string }
        ]
      }
    });
    connected = !!connection && connection.status === "accepted";
    viewerConnection = connection ? { id: connection.id, status: connection.status } : null;
  }

  const [eventsHostedCount, connectionsCount, hostedEvents, timelineAttendees, publicAttendees] =
    await Promise.all([
      prisma.event.count({ where: { hostId: user.id } }),
      prisma.connection.count({
        where: {
          status: "accepted",
          OR: [{ user1Id: user.id }, { user2Id: user.id }]
        }
      }),
      prisma.event.findMany({
        where: { hostId: user.id },
        orderBy: { eventDate: "asc" },
        take: 6,
        select: {
          id: true,
          title: true,
          eventDate: true,
          venueName: true,
          coverImageUrl: true,
          isFree: true,
          ticketPrice: true
        }
      }),
      prisma.eventAttendee.findMany({
        where: {
          userId: user.id,
          status: { in: ["committed", "attended"] }
        },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              eventDate: true,
              category: true,
              address: true,
              venueName: true,
              coverImageUrl: true,
              visibility: true
            }
          }
        },
        orderBy: { createdAt: "desc" }
      }),
      prisma.eventAttendee.findMany({
        where: {
          userId: user.id,
          status: { in: ["committed", "attended"] },
          event: { visibility: "public" }
        },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              eventDate: true,
              category: true,
              address: true,
              venueName: true,
              coverImageUrl: true
            }
          }
        }
      })
    ]);

  const timelineEvents = timelineAttendees.map((item) => ({
    id: item.event.id,
    title: item.event.title,
    date: item.event.eventDate.toISOString(),
    category: item.event.category,
    venueName: item.event.venueName,
    location: item.event.address,
    status: item.status,
    imageUrl: item.event.coverImageUrl
  }));

  const publicCalendar = publicAttendees.map((item) => ({
    id: item.event.id,
    title: item.event.title,
    date: item.event.eventDate.toISOString(),
    category: item.event.category,
    location: item.event.venueName ?? item.event.address,
    status: item.status,
    imageUrl: item.event.coverImageUrl
  }));

  const uniqueTimeline = Array.from(
    new Map(timelineEvents.map((event) => [event.id, event])).values()
  );

  const uniquePublicCalendar = Array.from(
    new Map(publicCalendar.map((event) => [event.id, event])).values()
  );

  return NextResponse.json({
    user,
    isSelf,
    connectionStatus: viewerConnection?.status ?? (connected ? "accepted" : "none"),
    connectionId: viewerConnection?.id ?? null,
    stats: {
      eventsHosted: eventsHostedCount,
      connections: connectionsCount
    },
    hostedEvents: hostedEvents.map((event) => ({
      id: event.id,
      title: event.title,
      date: event.eventDate.toISOString(),
      venueName: event.venueName,
      coverImageUrl: event.coverImageUrl,
      isFree: event.isFree,
      ticketPrice: event.ticketPrice?.toString() ?? null
    })),
    timelineEvents: uniqueTimeline,
    publicCalendar: uniquePublicCalendar
  });
}
