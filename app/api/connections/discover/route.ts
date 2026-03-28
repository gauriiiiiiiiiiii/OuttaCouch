import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

const toRad = (value: number) => (value * Math.PI) / 180;

const distanceScore = (
  lat1?: number | null,
  lng1?: number | null,
  lat2?: number | null,
  lng2?: number | null
) => {
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

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") ?? "").trim();

  const me = await prisma.user.findUnique({
    where: { id: token.sub },
    select: { id: true, city: true, preferences: true, lat: true, lng: true }
  });

  const connections = await prisma.connection.findMany({
    where: {
      OR: [{ user1Id: token.sub }, { user2Id: token.sub }],
      status: { not: "removed" }
    },
    select: { user1Id: true, user2Id: true }
  });

  const blockedIds = new Set<string>([token.sub]);
  for (const connection of connections) {
    blockedIds.add(connection.user1Id === token.sub ? connection.user2Id : connection.user1Id);
  }

  const baseWhere: Record<string, unknown> = {
    id: { notIn: Array.from(blockedIds) },
    isDeactivated: false
  };

  const orFilters: Record<string, unknown>[] = [];
  if (query.length >= 2) {
    orFilters.push(
      { displayName: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } }
    );
  } else if (me?.preferences?.length) {
    orFilters.push({ preferences: { hasSome: me.preferences } });
  }

  if (me?.city) {
    orFilters.push({ city: me.city });
  }

  if (orFilters.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const users = await prisma.user.findMany({
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
    take: 12
  });

  const myPrefs = new Set(me?.preferences ?? []);

  const results = users
    .map((user) => {
      const name = user.displayName ?? user.email ?? null;
      if (!name) {
        return null;
      }
      const prefOverlap = (user.preferences ?? []).filter((pref) => myPrefs.has(pref));
      const prefScore = myPrefs.size > 0 ? prefOverlap.length / Math.max(1, myPrefs.size) : 0;
      const distance = distanceScore(
        me?.lat !== null && me?.lat !== undefined ? Number(me.lat) : null,
        me?.lng !== null && me?.lng !== undefined ? Number(me.lng) : null,
        user.lat !== null && user.lat !== undefined ? Number(user.lat) : null,
        user.lng !== null && user.lng !== undefined ? Number(user.lng) : null
      );
      const cityMatch = me?.city && user.city && me.city === user.city ? 0.2 : 0;
      const score = prefScore * 0.55 + distance * 0.25 + cityMatch;
      const matchReason =
        prefOverlap.length > 0
          ? `Shared interests: ${prefOverlap.slice(0, 2).join(", ")}`
          : user.city
            ? `Nearby in ${user.city}`
            : "Suggested for you";
      return {
        userId: user.id,
        name,
        photo: user.profilePhotoUrl,
        city: user.city,
        matchReason,
        score
      };
    })
    .filter((result): result is NonNullable<typeof result> => Boolean(result))
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ results });
}
