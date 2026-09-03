import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { selfUserSelect } from "@/lib/userSelect";

const MAX_DISPLAY_NAME = 80;
const MAX_BIO = 500;
const MAX_PREFERENCES = 20;

export async function GET(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET
    });
    if (!token?.sub) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: token.sub },
      select: selfUserSelect
    });

    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [hostedEvents, privateAttendees, connectionsCount] = await Promise.all([
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

    return NextResponse.json({
      user,
      stats: {
        eventsHosted: hostedEvents.length,
        eventsAttended: privateAttendees.length,
        connections: connectionsCount
      },
      privateCalendar
    });
  } catch (error) {
    console.error("User profile fetch error", error);
    return NextResponse.json({ error: "Database unavailable" }, { status: 502 });
  }
}

type ProfileUpdateBody = {
  displayName?: unknown;
  bio?: unknown;
  preferences?: unknown;
  profilePhotoUrl?: unknown;
  remindersEnabled?: unknown;
  recommendationsEnabled?: unknown;
};

export async function PUT(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET
  });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as ProfileUpdateBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: {
    displayName?: string;
    bio?: string;
    preferences?: string[];
    profilePhotoUrl?: string | null;
    remindersEnabled?: boolean;
    recommendationsEnabled?: boolean;
  } = {};

  if (body.displayName !== undefined) {
    if (typeof body.displayName !== "string" || !body.displayName.trim()) {
      return NextResponse.json({ error: "Display name required" }, { status: 400 });
    }
    if (body.displayName.trim().length > MAX_DISPLAY_NAME) {
      return NextResponse.json({ error: "Display name too long" }, { status: 400 });
    }
    data.displayName = body.displayName.trim();
  }

  if (body.bio !== undefined) {
    if (typeof body.bio !== "string" || body.bio.length > MAX_BIO) {
      return NextResponse.json({ error: "Bio must be text up to 500 characters" }, { status: 400 });
    }
    data.bio = body.bio.trim();
  }

  if (body.preferences !== undefined) {
    if (!Array.isArray(body.preferences) || body.preferences.some((p) => typeof p !== "string")) {
      return NextResponse.json({ error: "Preferences must be a list of strings" }, { status: 400 });
    }
    data.preferences = Array.from(new Set(body.preferences as string[])).slice(0, MAX_PREFERENCES);
  }

  if (body.profilePhotoUrl !== undefined) {
    if (body.profilePhotoUrl !== null && typeof body.profilePhotoUrl !== "string") {
      return NextResponse.json({ error: "Invalid photo URL" }, { status: 400 });
    }
    // Empty string means "unchanged" (hidden form fields default to "").
    if (body.profilePhotoUrl !== "") {
      data.profilePhotoUrl = body.profilePhotoUrl as string | null;
    }
  }

  if (typeof body.remindersEnabled === "boolean") {
    data.remindersEnabled = body.remindersEnabled;
  }
  if (typeof body.recommendationsEnabled === "boolean") {
    data.recommendationsEnabled = body.recommendationsEnabled;
  }

  // NOTE: profileComplete is intentionally not accepted here. It is set only by
  // the onboarding location step (PUT /api/users/me/location).
  const user = await prisma.user.update({
    where: { id: token.sub },
    data,
    select: selfUserSelect
  });

  return NextResponse.json({ user });
}

export async function DELETE(request: NextRequest) {
  const token = await getToken({
    req: request,
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
