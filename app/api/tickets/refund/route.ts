import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

type RefundBody = {
  ticketId: string;
  reason?: string;
};

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const body = (await request.json()) as RefundBody;

  // Verify ticket ownership and check if refundable
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

  if (ticket.paymentStatus !== "paid") {
    return NextResponse.json({ error: "Cannot refund unpaid ticket" }, { status: 400 });
  }

  // Check if event is within refund window (48 hours before event)
  const now = new Date();
  const hoursUntilEvent = (ticket.event.eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  
  if (hoursUntilEvent < 48) {
    return NextResponse.json(
      { error: "Cannot refund within 48 hours of event start" },
      { status: 400 }
    );
  }

  try {
    // Get the charge ID from Stripe using the payment intent ID
    const chargesResponse = await stripe.charges.list({
      payment_intent: ticket.paymentIntentId,
      limit: 1
    });

    if (!chargesResponse.data || !chargesResponse.data.length) {
      return NextResponse.json(
        { error: "No associated charge found" },
        { status: 400 }
      );
    }

    const charge = chargesResponse.data[0];

    // Create refund on the charge
    const refund = await stripe.refunds.create({
      charge: charge.id,
      reason: (body.reason || "requested_by_customer") as
        | "duplicate"
        | "fraudulent"
        | "requested_by_customer"
        | undefined
    });

    // Update ticket status
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        paymentStatus: "refunded"
      }
    });

    // Remove attendee from event
    await prisma.eventAttendee.deleteMany({
      where: {
        ticketId: ticket.id
      }
    });

    // Decrement event attendees
    await prisma.event.update({
      where: { id: ticket.eventId },
      data: {
        currentAttendees: { decrement: ticket.quantity }
      }
    });

    return NextResponse.json({
      success: true,
      refundId: refund.id,
      amount: refund.amount / 100
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refund failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
