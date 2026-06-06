import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

type RefundBody = {
  ticketId: string;
};

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as RefundBody;

  const ticket = await prisma.ticket.findUnique({
    where: { id: body.ticketId },
    include: { event: true }
  });

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (ticket.userId !== token.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (ticket.paymentStatus === "refunded") {
    return NextResponse.json({ error: "Already refunded" }, { status: 400 });
  }

  const now = new Date();
  const hoursUntilEvent =
    (ticket.event.eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilEvent < 48) {
    return NextResponse.json(
      { error: "Cannot cancel within 48 hours of event start" },
      { status: 400 }
    );
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { paymentStatus: "refunded" }
  });

  await prisma.eventAttendee.deleteMany({ where: { ticketId: ticket.id } });

  await prisma.event.update({
    where: { id: ticket.eventId },
    data: { currentAttendees: { decrement: ticket.quantity } }
  });

  return NextResponse.json({ success: true });
}
