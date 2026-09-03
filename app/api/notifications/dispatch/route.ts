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

  // Claim-then-fan-out inside one transaction. The claim is a single
  // conditional UPDATE ... RETURNING, so two overlapping cron runs cannot both
  // take the same rows: the second sees sentAt already set and claims nothing.
  // If creating the notifications fails, the claim rolls back with it.
  const sent = await prisma.$transaction(async (tx) => {
    const claimed = await tx.notificationSchedule.updateManyAndReturn({
      where: { sentAt: null, sendAt: { lte: now } },
      data: { sentAt: now }
    });

    if (claimed.length === 0) {
      return 0;
    }

    await tx.notification.createMany({
      data: claimed.map((item) => ({
        userId: item.userId,
        title: item.title,
        body: item.body,
        link: item.link
      }))
    });

    return claimed.length;
  });

  return NextResponse.json({ status: "ok", sent });
}

// Vercel Cron invokes with GET
export async function GET(request: NextRequest) {
  return POST(request);
}
