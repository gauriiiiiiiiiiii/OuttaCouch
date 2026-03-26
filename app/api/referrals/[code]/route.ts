import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Track referral link click and prepare registration data
 * Called when user visits /join?ref=[code]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  const code = params.code.toUpperCase();

  try {
    // Find invitation
    const invitation = await prisma.contactInvitation.findUnique({
      where: { referralCode: code },
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
        where: { referralCode: code },
        data: {
          status: "clicked",
          clickedAt: new Date()
        }
      });

      // Update referral link stats
      await prisma.referralLink.updateMany({
        where: {
          code: code,
          fromUserId: invitation.fromUserId
        },
        data: { clicks: { increment: 1 } }
      });
    }

    return NextResponse.json({
      code,
      invitedPhone: invitation.toPhone,
      fromUser: invitation.fromUser,
      message: "Referral link tracked successfully"
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to process referral" }, { status: 500 });
  }
}

/**
 * Complete registration process for referred user
 * Called after signup with referral code
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  const code = params.code.toUpperCase();
  const body = (await request.json()) as { newUserId: string };

  if (!body.newUserId) {
    return NextResponse.json({ error: "Missing user ID" }, { status: 400 });
  }

  try {
    // Update invitation with registered user
    const invitation = await prisma.contactInvitation.findUnique({
      where: { referralCode: code }
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invalid referral code" }, { status: 404 });
    }

    await prisma.contactInvitation.update({
      where: { referralCode: code },
      data: {
        status: "registered",
        registeredUserId: body.newUserId,
        updatedAt: new Date()
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
          registeredUserId: body.newUserId,
          registeredAt: new Date()
        }
      });
    }

    // Create automatic connection between referrer and referred user
    const existingConnection = await prisma.connection.findFirst({
      where: {
        OR: [
          { user1Id: invitation.fromUserId, user2Id: body.newUserId },
          { user1Id: body.newUserId, user2Id: invitation.fromUserId }
        ]
      }
    });

    if (!existingConnection) {
      await prisma.connection.create({
        data: {
          user1Id: invitation.fromUserId,
          user2Id: body.newUserId,
          status: "accepted",
          acceptedAt: new Date()
        }
      });

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
          userId: body.newUserId,
          title: "Connected!",
          body: "You're now connected with the person who invited you.",
          link: "/connections"
        }
      });
    }

    // Update referral link stats
    await prisma.referralLink.updateMany({
      where: {
        code: code,
        fromUserId: invitation.fromUserId
      },
      data: { registrations: { increment: 1 } }
    });

    return NextResponse.json({
      message: "Registration completed",
      connection: { created: true }
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to complete registration" }, { status: 500 });
  }
}
