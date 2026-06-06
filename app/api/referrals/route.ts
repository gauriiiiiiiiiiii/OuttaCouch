import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/authOptions";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const referralLinks = await prisma.referralLink.findMany({
      where: { fromUserId: session.user.id },
      orderBy: { createdAt: "desc" }
    });

    const invitations = await prisma.contactInvitation.findMany({
      where: { fromUserId: session.user.id },
      select: {
        id: true,
        toPhone: true,
        status: true,
        channel: true,
        clickedAt: true,
        registeredUser: {
          select: { id: true, displayName: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const stats = {
      totalInvitations: invitations.length,
      clicked: invitations.filter((i) => i.clickedAt).length,
      registered: invitations.filter((i) => i.status === "registered").length,
      totalClicks: referralLinks.reduce((sum, link) => sum + link.clicks, 0),
      totalRegistrations: referralLinks.reduce((sum, link) => sum + link.registrations, 0)
    };

    return NextResponse.json({ stats, invitations, referralLinks });
  } catch (error) {
    console.error("Referral fetch error", error);
    return NextResponse.json({ error: "Failed to fetch referral data" }, { status: 500 });
  }
}
