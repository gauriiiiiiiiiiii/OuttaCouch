import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await prisma.connection.findMany({
    where: {
      status: "accepted",
      OR: [{ user1Id: token.sub }, { user2Id: token.sub }]
    },
    include: { user1: true, user2: true }
  });

  const data = connections.map((connection) => {
    const other = connection.user1Id === token.sub ? connection.user2 : connection.user1;
    return {
      id: connection.id,
      userId: other.id,
      name: other.displayName ?? other.email ?? other.phone ?? "Member",
      photo: other.profilePhotoUrl
    };
  });

  return NextResponse.json({ connections: data });
}
