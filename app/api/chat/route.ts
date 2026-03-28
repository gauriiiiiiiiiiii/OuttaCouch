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

  const chats = connections
    .filter((connection) => connection.messages.length > 0)
    .map((connection) => {
      const other = connection.user1Id === token.sub ? connection.user2 : connection.user1;
      const name = other.displayName ?? other.email ?? other.phone ?? null;
      if (!name) {
        return null;
      }
      const lastMessage = connection.messages[0];
      return {
        connectionId: connection.id,
        userId: other.id,
        name,
        photo: other.profilePhotoUrl,
        lastMessage: lastMessage?.content ?? "",
        lastAt: lastMessage?.sentAt ?? null,
        sortAt: lastMessage?.sentAt ? lastMessage.sentAt.getTime() : 0
      };
    })
    .filter((chat): chat is NonNullable<typeof chat> => Boolean(chat))
    .sort((a, b) => b.sortAt - a.sortAt);

  return NextResponse.json({ chats });
}
