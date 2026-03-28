import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/notifications";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await prisma.connection.findUnique({
    where: { id }
  });

  if (!connection || connection.user2Id !== token.sub) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const updated = await prisma.connection.update({
    where: { id },
    data: { status: "accepted", acceptedAt: new Date() }
  });

  const existingMessage = await prisma.message.findFirst({
    where: { connectionId: updated.id }
  });
  if (!existingMessage) {
    await prisma.message.create({
      data: {
        connectionId: updated.id,
        senderId: token.sub,
        content: "Connection accepted. Start the conversation!",
        type: "text"
      }
    });
  }

  const requester = await prisma.user.findUnique({
    where: { id: connection.user1Id },
    select: { email: true }
  });

  await prisma.notification.create({
    data: {
      userId: connection.user1Id,
      title: "Connection accepted",
      body: "Your connection request was accepted.",
      link: "/connections"
    }
  });

  if (requester?.email) {
    await sendNotificationEmail({
      to: requester.email,
      subject: "Connection accepted",
      text: "Your connection request was accepted on OUTTACOUCH."
    });
  }

  return NextResponse.json({ status: updated.status });
}
