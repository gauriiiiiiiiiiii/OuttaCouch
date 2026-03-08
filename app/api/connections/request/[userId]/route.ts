import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/notifications";

export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const targetUser = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, email: true, displayName: true }
  });

  const existing = await prisma.connection.findFirst({
    where: {
      OR: [
        { user1Id: token.sub, user2Id: params.userId },
        { user1Id: params.userId, user2Id: token.sub }
      ]
    }
  });

  if (existing) {
    if (existing.status === "pending" && existing.user2Id === token.sub) {
      const updated = await prisma.connection.update({
        where: { id: existing.id },
        data: { status: "accepted", acceptedAt: new Date() }
      });
      await prisma.notification.create({
        data: {
          userId: existing.user1Id,
          title: "Connection accepted",
          body: "Your connection request was accepted.",
          link: "/connections"
        }
      });
      if (targetUser?.email) {
        await sendNotificationEmail({
          to: targetUser.email,
          subject: "Connection accepted",
          text: "Your connection request was accepted on OUTTACOUCH."
        });
      }
      return NextResponse.json({ status: updated.status, id: updated.id });
    }
    return NextResponse.json({ status: existing.status, id: existing.id });
  }

  const reciprocal = await prisma.connection.findFirst({
    where: {
      user1Id: params.userId,
      user2Id: token.sub,
      status: "pending"
    }
  });

  if (reciprocal) {
    const updated = await prisma.connection.update({
      where: { id: reciprocal.id },
      data: { status: "accepted", acceptedAt: new Date() }
    });
    await prisma.notification.create({
      data: {
        userId: reciprocal.user1Id,
        title: "Connection accepted",
        body: "Your connection request was accepted.",
        link: "/connections"
      }
    });
    if (targetUser?.email) {
      await sendNotificationEmail({
        to: targetUser.email,
        subject: "Connection accepted",
        text: "Your connection request was accepted on OUTTACOUCH."
      });
    }
    return NextResponse.json({ status: updated.status, id: updated.id });
  }

  const connection = await prisma.connection.create({
    data: {
      user1Id: token.sub,
      user2Id: params.userId,
      status: "pending",
      sharedEventId: body.sharedEventId ?? null
    }
  });

  await prisma.notification.create({
    data: {
      userId: params.userId,
      title: "New connection request",
      body: "You have a new connection request.",
      link: "/connections"
    }
  });

  if (targetUser?.email) {
    await sendNotificationEmail({
      to: targetUser.email,
      subject: "New connection request",
      text: "You have a new connection request on OUTTACOUCH."
    });
  }

  return NextResponse.json({ status: "pending", id: connection.id });
}
