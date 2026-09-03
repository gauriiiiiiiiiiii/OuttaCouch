import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { selfUserSelect } from "@/lib/userSelect";

const visibilityValues = ["private", "connections", "public"] as const;
type Visibility = (typeof visibilityValues)[number];

const isVisibility = (value: unknown): value is Visibility =>
  typeof value === "string" && (visibilityValues as readonly string[]).includes(value);

export async function PUT(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET
  });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { profileVisibility?: unknown; calendarVisibility?: unknown }
    | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: { profileVisibility?: Visibility; calendarVisibility?: Visibility } = {};

  if (body.profileVisibility !== undefined) {
    if (!isVisibility(body.profileVisibility)) {
      return NextResponse.json({ error: "Invalid profile visibility" }, { status: 400 });
    }
    data.profileVisibility = body.profileVisibility;
  }

  if (body.calendarVisibility !== undefined) {
    if (!isVisibility(body.calendarVisibility)) {
      return NextResponse.json({ error: "Invalid calendar visibility" }, { status: 400 });
    }
    data.calendarVisibility = body.calendarVisibility;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: token.sub },
    data,
    select: selfUserSelect
  });

  return NextResponse.json({ user });
}
