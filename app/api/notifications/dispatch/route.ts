import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const secret = process.env.NOTIFICATION_DISPATCH_SECRET;
  const provided = request.headers.get("x-notification-secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.notificationSchedule.findMany({
    where: { sentAt: null, sendAt: { lte: now } },
    orderBy: { sendAt: "asc" },
    take: 200
  });

  if (due.length === 0) {
    return NextResponse.json({ status: "ok", sent: 0 });
  }

  await prisma.$transaction([
    prisma.notification.createMany({
      data: due.map((item) => ({
        userId: item.userId,
        title: item.title,
        body: item.body,
        link: item.link
      }))
    }),
    prisma.notificationSchedule.updateMany({
      where: { id: { in: due.map((item) => item.id) } },
      data: { sentAt: now }
    })
  ]);

  return NextResponse.json({ status: "ok", sent: due.length });
}
