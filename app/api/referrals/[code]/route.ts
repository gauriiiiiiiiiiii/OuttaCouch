import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

/**
 * Track referral link click and prepare registration data
 * Called when user visits /join?ref=[code]
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const normalizedCode = code.toUpperCase();

  try {
    // Find invitation
    const invitation = await prisma.contactInvitation.findUnique({
      where: { referralCode: normalizedCode },
      select: {
        id: true,
        fromUserId: true,
        toPhone: true,
        status: true,
        fromUser: {
          select: {
            id: true,
            displayName: true,
            profilePhotoUrl: true
          }
        }
      }
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invalid referral code" }, { status: 404 });
    }

    if (invitation.status === "registered") {
      return NextResponse.json(
        { error: "Already registered via this link" },
        { status: 400 }
      );
    }

    // Track click
    if (invitation.status !== "clicked") {
      await prisma.contactInvitation.update({
        where: { referralCode: normalizedCode },
        data: {
          status: "clicked",
          clickedAt: new Date()
        }
      });

      // Update referral link stats
      await prisma.referralLink.updateMany({
        where: {
          code: normalizedCode,
          fromUserId: invitation.fromUserId
        },
        data: { clicks: { increment: 1 } }
      });
    }

    return NextResponse.json({
      code: normalizedCode,
      invitedPhone: invitation.toPhone,
      fromUser: invitation.fromUser,
      message: "Referral link tracked successfully"
    });
  } catch (error) {
    console.error("Referral code GET error", error);
    return NextResponse.json({ error: "Failed to process referral" }, { status: 500 });
  }
}

/**
 * Complete a referral for the *signed-in* user.
 *
 * The normal signup path completes referrals inline (see /api/auth/register);
 * this endpoint exists for users who registered without the code and redeem it
 * afterwards. The redeeming user is always the caller, never a body value.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const normalizedCode = code.toUpperCase();

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const newUserId = token.sub;

  try {
    const invitation = await prisma.contactInvitation.findUnique({
      where: { referralCode: normalizedCode }
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invalid referral code" }, { status: 404 });
    }

    if (invitation.status === "registered") {
      return NextResponse.json({ error: "Already registered via this link" }, { status: 409 });
    }

    if (invitation.fromUserId === newUserId) {
      return NextResponse.json({ error: "Cannot redeem your own invitation" }, { status: 400 });
    }

    await prisma.contactInvitation.update({
      where: { referralCode: normalizedCode },
      data: {
        status: "registered",
        registeredUserId: newUserId
      }
    });

    // Update contact import status
    const contactImport = await prisma.contactImport.findFirst({
      where: {
        phone: invitation.toPhone,
        userId: invitation.fromUserId
      }
    });

    if (contactImport) {
      await prisma.contactImport.update({
        where: { id: contactImport.id },
        data: {
          status: "registered",
          registeredUserId: newUserId,
          registeredAt: new Date()
        }
      });
    }

    // Connect referrer and referred user. A previously removed/declined/pending
    // connection is re-activated rather than left dormant.
    const existingConnection = await prisma.connection.findFirst({
      where: {
        OR: [
          { user1Id: invitation.fromUserId, user2Id: newUserId },
          { user1Id: newUserId, user2Id: invitation.fromUserId }
        ]
      }
    });

    let connected = false;
    if (!existingConnection) {
      await prisma.connection.create({
        data: {
          user1Id: invitation.fromUserId,
          user2Id: newUserId,
          status: "accepted",
          acceptedAt: new Date()
        }
      });
      connected = true;
    } else if (existingConnection.status !== "accepted") {
      await prisma.connection.update({
        where: { id: existingConnection.id },
        data: { status: "accepted", acceptedAt: new Date() }
      });
      connected = true;
    }

    if (connected) {
      // Create welcome notifications
      await prisma.notification.create({
        data: {
          userId: invitation.fromUserId,
          title: "New connection",
          body: "Your referred friend just joined!",
          link: "/connections"
        }
      });

      await prisma.notification.create({
        data: {
          userId: newUserId,
          title: "Connected!",
          body: "You're now connected with the person who invited you.",
          link: "/connections"
        }
      });
    }

    // Update referral link stats
    await prisma.referralLink.updateMany({
      where: {
        code: normalizedCode,
        fromUserId: invitation.fromUserId
      },
      data: { registrations: { increment: 1 } }
    });

    return NextResponse.json({
      message: "Registration completed",
      connection: { created: connected }
    });
  } catch (error) {
    console.error("Referral code POST error", error);
    return NextResponse.json({ error: "Failed to complete registration" }, { status: 500 });
  }
}
