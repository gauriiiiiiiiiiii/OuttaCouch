import { NextResponse, type NextRequest } from "next/server";
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
