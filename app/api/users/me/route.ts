import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const token = await getToken({ req: request as any, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: token.sub }
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [eventsHostedCount, eventsAttended, connectionsCount] =
    await Promise.all([
      prisma.event.count({ where: { hostId: user.id } }),
      prisma.eventAttendee.findMany({
        where: { userId: user.id },
        include: { event: true }
      }),
      prisma.connection.count({
        where: {
          status: "accepted",
          OR: [{ user1Id: user.id }, { user2Id: user.id }]
        }
      })
    ]);

  const attendedEvents = eventsAttended.map((item) => ({
    id: item.event.id,
    title: item.event.title,
    date: item.event.eventDate.toISOString(),
    category: item.event.category,
    status: item.status,
    imageUrl: item.event.coverImageUrl
  }));

  return NextResponse.json({
    user,
    stats: {
      eventsHosted: eventsHostedCount,
      eventsAttended: eventsAttended.length,
      connections: connectionsCount
    },
    attendedEvents
  });
}

export async function PUT(request: Request) {
  const token = await getToken({ req: request as any, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const user = await prisma.user.update({
    where: { id: token.sub },
    data: {
      displayName: body.displayName ?? undefined,
      bio: body.bio ?? undefined,
      preferences: Array.isArray(body.preferences) ? body.preferences : undefined,
      profilePhotoUrl: body.profilePhotoUrl ?? undefined,
      profileComplete: body.profileComplete ?? undefined
    }
  });

  return NextResponse.json({ user });
}

export async function DELETE(request: Request) {
  const token = await getToken({ req: request as any, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: token.sub },
    data: {
      isDeactivated: true,
      deactivatedAt: new Date(),
      profileVisibility: "private",
      calendarVisibility: "private"
    }
  });

  return NextResponse.json({ status: "deactivated" });
}
