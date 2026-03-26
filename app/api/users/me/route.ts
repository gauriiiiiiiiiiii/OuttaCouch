import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const token = await getToken({
      req: request as any as Parameters<typeof getToken>[0]["req"],
      secret: process.env.NEXTAUTH_SECRET
    });
    if (!token?.sub) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: token.sub }
    });

    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [
      hostedEvents,
      privateAttendees,
      connectionsCount,
      swipedEvents
    ] = await Promise.all([
      prisma.event.findMany({
        where: { hostId: user.id },
        select: {
          id: true,
          title: true,
          eventDate: true,
          category: true,
          coverImageUrl: true
        }
      }),
      prisma.eventAttendee.findMany({
        where: {
          userId: user.id,
          status: { in: ["committed", "attended", "missed"] }
        },
        include: { event: true }
      }),
      prisma.connection.count({
        where: {
          status: "accepted",
          OR: [{ user1Id: user.id }, { user2Id: user.id }]
        }
      }),
      prisma.eventSwipe.findMany({
        where: {
          userId: user.id,
          action: "up"
        },
        include: { event: true }
      })
    ]);

    // Private Calendar: User's hosted events + events they committed to
    const hostedCalendarEvents = hostedEvents.map((event) => ({
      id: event.id,
      title: event.title,
      date: event.eventDate.toISOString(),
      category: event.category,
      status: "hosted",
      imageUrl: event.coverImageUrl
    }));

    const attendedCalendarEvents = privateAttendees.map((item) => ({
      id: item.event.id,
      title: item.event.title,
      date: item.event.eventDate.toISOString(),
      category: item.event.category,
      status: item.status,
      imageUrl: item.event.coverImageUrl
    }));

    const privateCalendar = [...hostedCalendarEvents, ...attendedCalendarEvents];
    const privateEventIds = new Set(privateCalendar.map((event) => event.id));
    
    // Public Calendar: Events the user swiped on (excluding private calendar events)
    const publicCalendar = swipedEvents
      .map((item) => ({
        id: item.event.id,
        title: item.event.title,
        date: item.event.eventDate.toISOString(),
        category: item.event.category,
        status: item.action,
        imageUrl: item.event.coverImageUrl
      }))
      .filter((event) => !privateEventIds.has(event.id));

    return NextResponse.json({
      user,
      stats: {
        eventsHosted: hostedEvents.length,
        eventsAttended: privateAttendees.length,
        connections: connectionsCount
      },
      privateCalendar,
      publicCalendar
    });
  } catch (error) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  const token = await getToken({
    req: request as any as Parameters<typeof getToken>[0]["req"],
    secret: process.env.NEXTAUTH_SECRET
  });
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
  const token = await getToken({
    req: request as any as Parameters<typeof getToken>[0]["req"],
    secret: process.env.NEXTAUTH_SECRET
  });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: token.sub },
    data: {
      email: null,
      phone: null,
      passwordHash: "",
      profilePhotoUrl: null,
      displayName: null,
      bio: null,
      preferences: [],
      profileComplete: false,
      isDeactivated: true,
      deactivatedAt: new Date(),
      profileVisibility: "private",
      calendarVisibility: "private"
    }
  });

  return NextResponse.json({ status: "deactivated" });
}
