import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { stripe } from "@/lib/stripe";

type ConfirmBody = {
  eventId: string;
  quantity: number;
  paymentIntentId?: string;
};

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = token.sub;

  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const body = (await request.json()) as ConfirmBody;
  const event = await prisma.event.findUnique({ where: { id: body.eventId } });
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (event.isFree) {
    return NextResponse.json({ error: "Free event" }, { status: 400 });
  }

  if (event.status === "cancelled") {
    return NextResponse.json({ error: "Event cancelled" }, { status: 409 });
  }

  if (!body.paymentIntentId) {
    return NextResponse.json({ error: "Missing paymentIntentId" }, { status: 400 });
  }

  const paymentIntentId = body.paymentIntentId;

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (paymentIntent.status !== "succeeded") {
    return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
  }

  const quantity = Math.max(1, Math.min(body.quantity || 1, 4));
  const expectedAmount = Math.round(Number(event.ticketPrice || 0) * quantity * 100);

  if (paymentIntent.metadata?.eventId !== event.id || paymentIntent.metadata?.userId !== userId) {
    return NextResponse.json({ error: "Payment metadata mismatch" }, { status: 400 });
  }

  if (paymentIntent.amount !== expectedAmount) {
    return NextResponse.json({ error: "Payment amount mismatch" }, { status: 400 });
  }

  if (paymentIntent.currency.toUpperCase() !== event.currency.toUpperCase()) {
    return NextResponse.json({ error: "Currency mismatch" }, { status: 400 });
  }

  const existingTicket = await prisma.ticket.findFirst({
    where: { paymentIntentId }
  });

  if (existingTicket) {
    return NextResponse.json({ ticketId: existingTicket.id });
  }

  const amountPaid = Number(event.ticketPrice || 0) * quantity;
  const qrCode = crypto.randomUUID();

  const result = await prisma.$transaction(async (tx) => {
    const freshEvent = await tx.event.findUnique({ where: { id: event.id } });
    if (!freshEvent) {
      throw new Error("EVENT_MISSING");
    }

    if (freshEvent.currentAttendees + quantity > freshEvent.maxAttendees) {
      throw new Error("EVENT_FULL");
    }

    const ticket = await tx.ticket.create({
      data: {
        eventId: freshEvent.id,
        userId,
        quantity,
        amountPaid,
        currency: freshEvent.currency,
        paymentIntentId,
        paymentStatus: "paid",
        qrCode
      }
    });

    await tx.eventAttendee.create({
      data: {
        eventId: freshEvent.id,
        userId,
        ticketId: ticket.id,
        status: "committed"
      }
    });

    await tx.event.update({
      where: { id: freshEvent.id },
      data: { currentAttendees: { increment: quantity } }
    });

    return ticket.id;
  }).catch((err) => {
    if ((err as Error).message === "EVENT_FULL") {
      return null;
    }
    throw err;
  });

  if (!result) {
    return NextResponse.json({ error: "Event full" }, { status: 409 });
  }

  return NextResponse.json({ ticketId: result });
}
