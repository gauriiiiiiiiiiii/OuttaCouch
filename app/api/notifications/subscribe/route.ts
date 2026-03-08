import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  await prisma.notification.create({
    data: {
      userId: token.sub,
      title: "Notifications enabled",
      body: `Subscription registered${body.token ? "." : " (token missing)."}`,
      link: "/settings/notifications"
    }
  });

  return NextResponse.json({ status: "subscribed" });
}
