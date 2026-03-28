import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/authOptions";
import { sendInvitationMessage } from "@/lib/twilioSms";

/**
 * Share referral link with contacts via SMS/WhatsApp
 * POST /api/referrals/share
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    phones?: string[];
    contactIds?: string[];
    channel?: "sms" | "whatsapp";
  };

  if (!body.phones?.length && !body.contactIds?.length) {
    return NextResponse.json(
      { error: "Must provide phones or contact IDs" },
      { status: 400 }
    );
  }

  try {
    // Get user details for message
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { displayName: true }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Collect phone numbers to invite
    let phonesToInvite: string[] = body.phones || [];

    if (body.contactIds?.length) {
      const contacts = (await prisma.contactImport.findMany({
        where: {
          id: { in: body.contactIds },
          userId: session.user.id
        },
        select: { phone: true }
      })) as Array<{ phone: string }>;

      phonesToInvite = [
        ...phonesToInvite,
        ...contacts.map((contact) => contact.phone)
      ];
    }

    // Remove duplicates
    phonesToInvite = [...new Set(phonesToInvite)];

    const channel = body.channel || "sms";
    const invitations = [];

    for (const phone of phonesToInvite) {
      // Check if already invited
      const existingInvitation = await prisma.contactInvitation.findFirst({
        where: {
          fromUserId: session.user.id,
          toPhone: phone
        }
      });

      if (existingInvitation) {
        invitations.push({
          id: existingInvitation.id,
          phone,
          referralCode: existingInvitation.referralCode,
          status: "already-invited"
        });
        continue;
      }

      // Generate unique referral code
      let referralCode = "";
      let isUnique = false;

      while (!isUnique) {
        referralCode = generateReferralCode();
        const existing = await prisma.referralLink.findFirst({
          where: { code: referralCode }
        });
        if (!existing) isUnique = true;
      }

      // Create invitation
      const invitation = await prisma.contactInvitation.create({
        data: {
          fromUserId: session.user.id,
          toPhone: phone,
          referralCode: referralCode,
          channel: channel,
          sentAt: new Date()
        }
      });

      // Create referral link
      await prisma.referralLink.create({
        data: {
          code: referralCode,
          fromUserId: session.user.id,
          type: "contact"
        }
      });

      // Send invitation message
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://outtacouch.com";
      const joinUrl = `${appUrl}/join?ref=${referralCode}`;

      await sendInvitationMessage(phone, joinUrl, channel, user.displayName || "A friend");

      invitations.push({
        id: invitation.id,
        phone,
        referralCode,
        status: "sent"
      });
    }

    // Update contact import with invitation attempts
    if (body.contactIds?.length) {
      await prisma.contactImport.updateMany({
        where: {
          id: { in: body.contactIds },
          userId: session.user.id
        },
        data: {
          invitedAt: new Date(),
          status: "invited"
        }
      });
    }

    return NextResponse.json({
      message: "Invitations sent successfully",
      invitations
    });
  } catch (error) {
    console.error("Referral share error:", error);
    return NextResponse.json({ error: "Failed to send invitations" }, { status: 500 });
  }
}

/**
 * Get user's referral stats
 * GET /api/referrals
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const referralLinks = (await prisma.referralLink.findMany({
      where: { fromUserId: session.user.id },
      orderBy: { createdAt: "desc" }
    })) as Array<{ clicks: number; registrations: number }>;

    const invitations = (await prisma.contactInvitation.findMany({
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
    })) as Array<{ status: string; clickedAt: Date | null }>;

    const stats = {
      totalInvitations: invitations.length,
      clicked: invitations.filter((invitation) => invitation.clickedAt).length,
      registered: invitations.filter((invitation) => invitation.status === "registered").length,
      totalClicks: referralLinks.reduce(
        (sum: number, link) => sum + link.clicks,
        0
      ),
      totalRegistrations: referralLinks.reduce(
        (sum: number, link) => sum + link.registrations,
        0
      )
    };

    return NextResponse.json({
      stats,
      invitations,
      referralLinks
    });
  } catch (error) {
    console.error("Referral fetch error", error);
    return NextResponse.json({ error: "Failed to fetch referral data" }, { status: 500 });
  }
}

function generateReferralCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
