import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

function isAuthorized(request: NextRequest): boolean {
  // Manual trigger via x-notification-secret header
  const dispatchSecret = process.env.NOTIFICATION_DISPATCH_SECRET;
  const providedSecret = request.headers.get("x-notification-secret");
  if (dispatchSecret && providedSecret === dispatchSecret) return true;

  // Vercel Cron via Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  return false;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
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

// Vercel Cron invokes with GET
export async function GET(request: NextRequest) {
  return POST(request);
}
