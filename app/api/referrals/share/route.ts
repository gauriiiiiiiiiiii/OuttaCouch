import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/authOptions";
import { sendInvitationMessage } from "@/lib/twilioSms";
import { normalizeContact } from "@/lib/normalizeContact";
import { generateReferralCode } from "@/lib/referralCode";

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
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { displayName: true }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Raw phones from the client are normalised; unparseable ones are dropped.
    let phonesToInvite: string[] = (body.phones || [])
      .map((phone) => normalizeContact(phone))
      .filter((phone) => phone && !phone.includes("@"));

    if (body.contactIds?.length) {
      const contacts = await prisma.contactImport.findMany({
        where: {
          id: { in: body.contactIds },
          userId: session.user.id
        },
        select: { phone: true }
      });
      phonesToInvite = [...phonesToInvite, ...contacts.map((c) => c.phone)];
    }

    phonesToInvite = [...new Set(phonesToInvite)];

    if (phonesToInvite.length === 0) {
      return NextResponse.json({ error: "No valid phone numbers to invite" }, { status: 400 });
    }

    const channel = body.channel === "whatsapp" ? "whatsapp" : "sms";
    const invitations = [];

    for (const phone of phonesToInvite) {
      const existingInvitation = await prisma.contactInvitation.findFirst({
        where: { fromUserId: session.user.id, toPhone: phone }
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

      let referralCode = "";
      let isUnique = false;
      while (!isUnique) {
        referralCode = generateReferralCode();
        const existing = await prisma.referralLink.findFirst({
          where: { code: referralCode }
        });
        if (!existing) isUnique = true;
      }

      const invitation = await prisma.contactInvitation.create({
        data: {
          fromUserId: session.user.id,
          toPhone: phone,
          referralCode,
          channel,
          sentAt: new Date()
        }
      });

      await prisma.referralLink.create({
        data: {
          code: referralCode,
          fromUserId: session.user.id,
          type: "contact"
        }
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://outtacouch.com";
      const joinUrl = `${appUrl}/join?ref=${referralCode}`;
      await sendInvitationMessage(phone, joinUrl, channel, user.displayName || "A friend");

      invitations.push({ id: invitation.id, phone, referralCode, status: "sent" });
    }

    if (body.contactIds?.length) {
      await prisma.contactImport.updateMany({
        where: { id: { in: body.contactIds }, userId: session.user.id },
        data: { invitedAt: new Date(), status: "invited" }
      });
    }

    return NextResponse.json({ message: "Invitations sent successfully", invitations });
  } catch (error) {
    console.error("Referral share error:", error);
    return NextResponse.json({ error: "Failed to send invitations" }, { status: 500 });
  }
}
