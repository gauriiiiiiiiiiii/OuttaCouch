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

  if (!isSelf) {
    if (user.profileVisibility === "private") {
      return NextResponse.json({ error: "Profile not available" }, { status: 403 });
    }

    if (user.profileVisibility === "connections") {
      if (!token?.sub) {
        return NextResponse.json({ error: "Profile not available" }, { status: 403 });
      }

      const connected = await prisma.connection.findFirst({
        where: {
          status: "accepted",
          OR: [
            { user1Id: token.sub, user2Id: user.id },
            { user1Id: user.id, user2Id: token.sub }
          ]
        }
      });

      if (!connected) {
        return NextResponse.json({ error: "Profile not available" }, { status: 403 });
      }
    }
  }

  const [eventsHostedCount, connectionsCount, hostedEvents] = await Promise.all([
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
    })
  ]);

  return NextResponse.json({
    user,
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
    }))
  });
}
