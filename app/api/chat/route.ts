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
    include: {
      user1: true,
      user2: true,
      messages: { orderBy: { sentAt: "desc" }, take: 1 }
    }
  });

  const recencyScore = (date?: Date | null) => {
    if (!date) {
      return 0;
    }
    const days = Math.max(
      0,
      Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
    );
    return Math.exp(-days / 14);
  };

  const chats = connections
    .filter((connection) => connection.messages.length > 0)
    .map((connection) => {
      const other = connection.user1Id === token.sub ? connection.user2 : connection.user1;
      const lastMessage = connection.messages[0];
      const score = recencyScore(lastMessage?.sentAt ?? null);
      return {
        connectionId: connection.id,
        name: other.displayName ?? other.email ?? other.phone ?? "Member",
        photo: other.profilePhotoUrl,
        lastMessage: lastMessage?.content ?? "",
        lastAt: lastMessage?.sentAt ?? null,
        score
      };
    })
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({
    chats: chats.map(({ score, ...chat }) => chat)
  });
}
