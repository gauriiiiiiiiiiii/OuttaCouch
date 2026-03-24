import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requests = await prisma.connection.findMany({
    where: { status: "pending", user2Id: token.sub },
    include: { user1: true, sharedEvent: true }
  });

  const data = requests.map((request) => ({
    id: request.id,
    userId: request.user1Id,
    name: request.user1.displayName ?? request.user1.email ?? request.user1.phone ?? "Member",
    photo: request.user1.profilePhotoUrl,
    sharedEventId: request.sharedEventId,
    sharedEventTitle: request.sharedEvent?.title ?? "Shared event",
    requestedAt: request.requestedAt
  }));

  return NextResponse.json({ requests: data });
}
