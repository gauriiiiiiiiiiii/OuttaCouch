import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const viewerId = token?.sub ?? null;

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, profileVisibility: true }
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (viewerId !== user.id) {
    if (user.profileVisibility === "private") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (user.profileVisibility === "connections") {
      const connection = await prisma.connection.findFirst({
        where: {
          status: "accepted",
          OR: [
            { user1Id: viewerId ?? "", user2Id: user.id },
            { user1Id: user.id, user2Id: viewerId ?? "" }
          ]
        }
      });
      if (!connection) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const memories = await prisma.memory.findMany({
    where: { userId: user.id },
    include: { event: true },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({
    memories: memories.map((memory) => ({
      id: memory.id,
      imageUrl: memory.imageUrl,
      caption: memory.caption,
      createdAt: memory.createdAt.toISOString(),
      event: memory.event
        ? {
            id: memory.event.id,
            title: memory.event.title,
            date: memory.event.eventDate.toISOString(),
            category: memory.event.category
          }
        : null
    }))
  });
}
