import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { emitToRoom } from "@/lib/socketServer";

export async function GET(
  request: NextRequest,
  { params }: { params: { connectionId: string } }
) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await prisma.connection.findUnique({
    where: { id: params.connectionId }
  });

  if (!connection || (connection.user1Id !== token.sub && connection.user2Id !== token.sub)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const messages = await prisma.message.findMany({
    where: { connectionId: params.connectionId },
    orderBy: { sentAt: "asc" }
  });

  return NextResponse.json({ messages });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { connectionId: string } }
) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await prisma.connection.findUnique({
    where: { id: params.connectionId }
  });

  if (!connection || (connection.user1Id !== token.sub && connection.user2Id !== token.sub)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const body = (await request.json()) as { content?: string };
  if (!body.content) {
    return NextResponse.json({ error: "Missing content" }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: {
      connectionId: params.connectionId,
      senderId: token.sub,
      content: body.content,
      type: "text"
    }
  });

  emitToRoom(params.connectionId, "message", message);

  return NextResponse.json({ message });
}
