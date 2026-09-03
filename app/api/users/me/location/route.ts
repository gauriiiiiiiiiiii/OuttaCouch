import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { selfUserSelect } from "@/lib/userSelect";

type LocationBody = {
  city?: unknown;
  lat?: unknown;
  lng?: unknown;
  profileComplete?: unknown;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export async function PUT(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET
  });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as LocationBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: { city?: string; lat?: number; lng?: number; profileComplete?: true } = {};

  if (body.city !== undefined && body.city !== null) {
    if (typeof body.city !== "string") {
      return NextResponse.json({ error: "City must be text" }, { status: 400 });
    }
    const city = body.city.trim();
    if (city) data.city = city.slice(0, 120);
  }

  const hasLat = body.lat !== undefined && body.lat !== null;
  const hasLng = body.lng !== undefined && body.lng !== null;
  if (hasLat !== hasLng) {
    return NextResponse.json({ error: "lat and lng must be provided together" }, { status: 400 });
  }
  if (hasLat) {
    if (!isFiniteNumber(body.lat) || !isFiniteNumber(body.lng) || Math.abs(body.lat) > 90 || Math.abs(body.lng) > 180) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }
    data.lat = body.lat;
    data.lng = body.lng;
  }

  // Completing onboarding requires a real location on file.
  if (body.profileComplete === true) {
    if (!hasLat && !data.city) {
      return NextResponse.json({ error: "A location is required to complete your profile" }, { status: 400 });
    }
    data.profileComplete = true;
  }

  const user = await prisma.user.update({
    where: { id: token.sub },
    data,
    select: selfUserSelect
  });

  return NextResponse.json({ user });
}
