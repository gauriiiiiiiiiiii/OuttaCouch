import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: token.sub },
    select: { lat: true, lng: true, preferences: true, city: true }
  });

  const myAttendances = await prisma.eventAttendee.findMany({
    where: { userId: token.sub },
    include: { event: { select: { id: true, title: true, eventDate: true } } }
  });

  const eventIds = myAttendances.map((item) => item.eventId);

  const existingConnections = await prisma.connection.findMany({
    where: {
      OR: [{ user1Id: token.sub }, { user2Id: token.sub }]
    },
    select: { user1Id: true, user2Id: true, status: true }
  });

  const blockedUserIds = new Set(
    existingConnections
      .filter((connection) => connection.status !== "removed")
      .map((connection) =>
        connection.user1Id === token.sub ? connection.user2Id : connection.user1Id
      )
  );

  const shared = eventIds.length
    ? await prisma.eventAttendee.findMany({
        where: {
          eventId: { in: eventIds },
          userId: { not: token.sub, notIn: Array.from(blockedUserIds) }
        },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              email: true,
              profilePhotoUrl: true,
              lat: true,
              lng: true,
              preferences: true,
              city: true
            }
          },
          event: {
            select: { id: true, title: true, eventDate: true, category: true }
          }
        }
      })
    : [];

  const myPrefs = new Set(me?.preferences ?? []);

  const toRad = (value: number) => (value * Math.PI) / 180;
  const distanceScore = (lat1?: number | null, lng1?: number | null, lat2?: number | null, lng2?: number | null) => {
    if (
      lat1 === null ||
      lng1 === null ||
      lat2 === null ||
      lng2 === null ||
      lat1 === undefined ||
      lng1 === undefined ||
      lat2 === undefined ||
      lng2 === undefined
    ) {
      return 0.5;
    }
    const r = 6371;
    const dLat = toRad(Number(lat2) - Number(lat1));
    const dLng = toRad(Number(lng2) - Number(lng1));
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(Number(lat1))) *
        Math.cos(toRad(Number(lat2))) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = r * c;
    return Math.exp(-distance / 10);
  };

  const preferenceScore = (prefs?: string[] | null) => {
    if (!prefs || prefs.length === 0 || myPrefs.size === 0) {
      return 0;
    }
    const overlap = prefs.filter((pref) => myPrefs.has(pref)).length;
    return overlap / Math.max(1, myPrefs.size);
  };

  const suggestionsMap = shared.reduce<
    Record<
      string,
      {
        userId: string;
        name: string;
        photo?: string | null;
        sharedEventTitle: string | null;
        sharedEventId: string | null;
        sharedCount: number;
        latestSharedAt: Date;
        score: number;
      }
    >
  >((acc, item) => {
    const existing = acc[item.userId];
    if (existing) {
      existing.sharedCount += 1;
      if (item.event.eventDate > existing.latestSharedAt) {
        existing.latestSharedAt = item.event.eventDate;
        existing.sharedEventTitle = item.event.title;
        existing.sharedEventId = item.event.id;
      }
      return acc;
    }
    const recencyDays = Math.max(
      0,
      Math.floor((Date.now() - item.event.eventDate.getTime()) / (1000 * 60 * 60 * 24))
    );
    const recency = Math.exp(-recencyDays / 30);
    const distance = distanceScore(
      me?.lat !== null && me?.lat !== undefined ? Number(me.lat) : null,
      me?.lng !== null && me?.lng !== undefined ? Number(me.lng) : null,
      item.user.lat !== null && item.user.lat !== undefined ? Number(item.user.lat) : null,
      item.user.lng !== null && item.user.lng !== undefined ? Number(item.user.lng) : null
    );
    const prefScore = preferenceScore(item.user.preferences ?? []);
    const sharedScore = Math.min(1, 0.25 * 1);
    const score =
      sharedScore * 0.35 +
      recency * 0.2 +
      distance * 0.2 +
      prefScore * 0.15;
    acc[item.userId] = {
      userId: item.userId,
      name: item.user.displayName ?? item.user.email ?? "User",
      photo: item.user.profilePhotoUrl,
      sharedEventTitle: item.event.title,
      sharedEventId: item.event.id,
      sharedCount: 1,
      latestSharedAt: item.event.eventDate,
      score
    };
    return acc;
  }, {});

  const TARGET_SUGGESTIONS = 10;

  if (Object.keys(suggestionsMap).length < TARGET_SUGGESTIONS) {
    const baseWhere: Record<string, unknown> = {
      id: { notIn: [token.sub, ...Array.from(blockedUserIds)] },
      isDeactivated: false
    };
    const orFilters: Record<string, unknown>[] = [];
    if (me?.preferences?.length) {
      orFilters.push({ preferences: { hasSome: me.preferences } });
    }
    if (me?.city) {
      orFilters.push({ city: me.city });
    }

    const discoverUsers = await prisma.user.findMany({
      where: orFilters.length > 0 ? { ...baseWhere, OR: orFilters } : baseWhere,
      select: {
        id: true,
        displayName: true,
        email: true,
        profilePhotoUrl: true,
        preferences: true,
        lat: true,
        lng: true,
        city: true
      },
      take: 24
    });

    for (const user of discoverUsers) {
      if (suggestionsMap[user.id]) {
        continue;
      }
      const prefScore = preferenceScore(user.preferences ?? []);
      const distance = distanceScore(
        me?.lat !== null && me?.lat !== undefined ? Number(me.lat) : null,
        me?.lng !== null && me?.lng !== undefined ? Number(me.lng) : null,
        user.lat !== null && user.lat !== undefined ? Number(user.lat) : null,
        user.lng !== null && user.lng !== undefined ? Number(user.lng) : null
      );
      const cityBoost = me?.city && user.city && me.city === user.city ? 0.2 : 0;
      const score = prefScore * 0.55 + distance * 0.25 + cityBoost;
      suggestionsMap[user.id] = {
        userId: user.id,
        name: user.displayName ?? user.email ?? "User",
        photo: user.profilePhotoUrl,
        sharedEventTitle: null,
        sharedEventId: null,
        sharedCount: 0,
        latestSharedAt: new Date(),
        score
      };
    }
  }

  const candidateIds = Object.keys(suggestionsMap);
  const acceptedConnections = await prisma.connection.findMany({
    where: {
      status: "accepted",
      OR: [{ user1Id: { in: candidateIds } }, { user2Id: { in: candidateIds } }]
    },
    select: { user1Id: true, user2Id: true }
  });

  const myConnectionIds = new Set(
    existingConnections
      .filter((connection) => connection.status === "accepted")
      .map((connection) =>
        connection.user1Id === token.sub ? connection.user2Id : connection.user1Id
      )
  );

  const mutualsMap = candidateIds.reduce<Record<string, number>>((acc, id) => {
    acc[id] = 0;
    return acc;
  }, {});

  for (const connection of acceptedConnections) {
    const a = connection.user1Id;
    const b = connection.user2Id;
    if (candidateIds.includes(a) && myConnectionIds.has(b)) {
      mutualsMap[a] += 1;
    }
    if (candidateIds.includes(b) && myConnectionIds.has(a)) {
      mutualsMap[b] += 1;
    }
  }

  const suggestions = Object.values(suggestionsMap)
    .map((suggestion) => {
      const sharedScore = Math.min(1, suggestion.sharedCount / 3);
      const recencyDays = Math.max(
        0,
        Math.floor((Date.now() - suggestion.latestSharedAt.getTime()) / (1000 * 60 * 60 * 24))
      );
      const recency = Math.exp(-recencyDays / 30);
      const mutuals = Math.min(1, (mutualsMap[suggestion.userId] ?? 0) / 3);
      const score =
        sharedScore * 0.35 +
        recency * 0.2 +
        suggestion.score * 0.45 +
        mutuals * 0.1;
      return { ...suggestion, score };
    })
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ suggestions });
}
