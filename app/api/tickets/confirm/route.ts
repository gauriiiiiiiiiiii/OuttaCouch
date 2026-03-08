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

  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const body = (await request.json()) as ConfirmBody;
  const event = await prisma.event.findUnique({ where: { id: body.eventId } });
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!body.paymentIntentId) {
    return NextResponse.json({ error: "Missing paymentIntentId" }, { status: 400 });
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(body.paymentIntentId);
  if (paymentIntent.status !== "succeeded") {
    return NextResponse.json({ error: "Payment not completed" }, { status: 400 });
  }

  const existingTicket = await prisma.ticket.findFirst({
    where: { paymentIntentId: body.paymentIntentId }
  });

  if (existingTicket) {
    return NextResponse.json({ ticketId: existingTicket.id });
  }

  const quantity = Math.max(1, Math.min(body.quantity || 1, 4));
  const amountPaid = Number(event.ticketPrice || 0) * quantity;
  const qrCode = crypto.randomUUID();

  const ticket = await prisma.ticket.create({
    data: {
      eventId: event.id,
      userId: token.sub,
      quantity,
      amountPaid,
      currency: event.currency,
      paymentIntentId: body.paymentIntentId,
      paymentStatus: "paid",
      qrCode
    }
  });

  await prisma.eventAttendee.create({
    data: {
      eventId: event.id,
      userId: token.sub,
      ticketId: ticket.id,
      status: "committed"
    }
  });

  await prisma.event.update({
    where: { id: event.id },
    data: { currentAttendees: { increment: quantity } }
  });

  return NextResponse.json({ ticketId: ticket.id });
}
