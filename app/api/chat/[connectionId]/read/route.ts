import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { emitToRoom } from "@/lib/socketServer";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.message.updateMany({
    where: {
      connectionId,
      senderId: { not: token.sub },
      readAt: null
    },
    data: { readAt: new Date() }
  });

  emitToRoom(connectionId, "read", {
    connectionId,
    readAt: new Date().toISOString()
  });

  return NextResponse.json({ status: "ok" });
}
